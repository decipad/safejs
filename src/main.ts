import MyWorker from "./worker?worker&inline";

interface SafeJsOptions {
  maxWorkerReturn: number;
  maxExecutingTime: number;
  maxConsoleLog: number;
  extraWhitelist: Array<string>;
}

export type WorkerInitMessage = Omit<SafeJsOptions, "maxExecutingTime">;

// Both result and logs will be JSON.stringified so they can be parsed by client.
export interface ResultMessageType {
  result: string;
  logs: string[];
}

export interface ErrorMessageType {
  result: Error;
  logs: string[];
}

export type WorkerMessageType = ResultMessageType | ErrorMessageType;

/**
 * SafeJs is a way to run safe user-provided JavaScript code in a web worker.
 * The web worker has no access to DOM or window object, see [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), and we go even further by re-writing the `get` method of many web worker function to throw error, making them unusable.
 * We also restrict the `prototype` of the `self` object in the web worker, making the execution of the code safe.
 * There is also a whitelist which allows the web worker to define what functions are allowed (for example decipads usecase needs `fetch`, but you might not want to allow this).
 */
export class SafeJs {
  // @ts-ignore - Typescript doesnt seem to know `this.worker` is initialised in a private function.
  private worker: Worker;
  // @ts-ignore - Typescript doesnt seem to know `this.channel` is initialised in a private function.
  private channel: MessageChannel;
  private executing: boolean;

  // Is the worker still alive?
  // Constrols whether or not we can re-create the worker.
  private isAlive: boolean = false;

  private errorMessageCallback: (err: ErrorMessageType) => void;
  private handleMessages: (msg: any) => void;

  private MAX_WORKER_RETURN: number = 20000;
  private MAX_EXECUTING_TIME: number = 10000;
  private maxConsoleLog: number = 200;

  private extraWhitelist: Array<string> = [];

  /**
   * @param workerMessageCallback
   * @param maxWorkerReturn the max size of the stringified return from the worker
   */
  constructor(
    workerMessageCallback: (res: ResultMessageType) => void,
    workerErrorCallback: (err: ErrorMessageType) => void,
    {
      maxWorkerReturn,
      maxExecutingTime,
      extraWhitelist,
      maxConsoleLog,
    }: Readonly<Partial<SafeJsOptions>> = {}
  ) {
    this.executing = false;
    this.errorMessageCallback = workerErrorCallback;

    if (maxWorkerReturn) {
      this.MAX_WORKER_RETURN = maxWorkerReturn;
    }

    if (maxExecutingTime) {
      this.MAX_EXECUTING_TIME = maxExecutingTime;
    }

    if (extraWhitelist) {
      this.extraWhitelist = extraWhitelist;
    }

    if (maxConsoleLog) {
      this.maxConsoleLog = maxConsoleLog;
    }

    this.handleMessages = (msg) => {
      try {
        const workerMsg: WorkerMessageType = JSON.parse(msg.data);
        this.executing = false;

        if (typeof workerMsg.result === "string") {
          workerMessageCallback(workerMsg as ResultMessageType);
        } else {
          this.errorMessageCallback(workerMsg as ErrorMessageType);
        }
      } catch (_e) {
        this.executing = false;
        this.errorMessageCallback({
          result: new Error("Unable to parse message from worker"),
          logs: [],
        });
      }
    };

    this.initWorker();
  }

  /**
   * initialised the worked, used by constructor and when execution of worker takes too long.
   * Initially ran by the constructor, so no need to run unless you use @method kill.
   */
  public initWorker() {
    if (this.isAlive) return;

    this.worker = new MyWorker();
    this.channel = new MessageChannel();

    const firstMessage: WorkerInitMessage = {
      maxWorkerReturn: this.MAX_WORKER_RETURN,
      extraWhitelist: this.extraWhitelist,
      maxConsoleLog: this.maxConsoleLog,
    };

    this.worker.postMessage(firstMessage, [this.channel.port2]);
    this.channel.port1.onmessage = this.handleMessages;

    this.isAlive = true;
  }

  /**
   * @param code - The actual JS you want to execute in the worker
   * @returns nothing, because the `workerMessageCallback` will be used to return the result.
   */
  async execute(code: string) {
    if (!this.isAlive) {
      this.errorMessageCallback({
        result: new Error("Web worker has been terminated"),
        logs: [],
      });
      return;
    }

    if (this.executing) {
      this.errorMessageCallback({
        result: new Error("Worker is still executing, please wait"),
        logs: [],
      });
      return;
    }

    this.executing = true;

    // Prevents the worker from running for too long.
    setTimeout(() => {
      if (this.executing) {
        this.worker.terminate();
        this.errorMessageCallback({
          result: new Error("Web worker took too long to complete"),
          logs: [],
        });
        this.isAlive = false;
        this.initWorker();
      }
    }, this.MAX_EXECUTING_TIME);

    this.worker.postMessage(code);
  }

  /**
   * Kills the worker, and therefore makes the instance of this
   * class unusable.
   *
   * You can use the @method initWorker to recreate a worker.
   */
  kill() {
    this.isAlive = false;
    this.worker.terminate();
  }
}
