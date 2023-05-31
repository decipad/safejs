import MyWorker from "./worker?worker&inline";

interface SafeJsOptions {
  maxWorkerReturn: number;
  maxExecutingTime: number;
  consoleLogTimeout: number;
  extraWhitelist: Array<string>;
}

export type WorkerInitMessage = Omit<SafeJsOptions, "maxExecutingTime">;

export interface WorkerMessageType {
  /** log is a result of using console.log */
  type: "result" | "internal-safe-js-log";
  message: string;
}

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

  private errorMessageCallback: (err: Error) => void;
  private handleMessages: (msg: any) => void;

  private MAX_WORKER_RETURN: number = 20000;
  private MAX_EXECUTING_TIME: number = 10000;
  private consoleLogTimeout: number = 200;

  private extraWhitelist: Array<string> = [];

  /**
   * @param workerMessageCallback
   * @param maxWorkerReturn the max size of the stringified return from the worker
   */
  constructor(
    workerMessageCallback: (res: WorkerMessageType) => void,
    workerErrorCallback: (err: Error) => void,
    {
      maxWorkerReturn,
      maxExecutingTime,
      extraWhitelist,
      consoleLogTimeout,
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

    if (consoleLogTimeout) {
      this.consoleLogTimeout = consoleLogTimeout;
    }

    this.handleMessages = (msg) => {
      if (msg.data instanceof Error) {
        this.executing = false;
        this.errorMessageCallback(msg.data);
      } else if (typeof msg.data === "string") {
        try {
          const workerMsg: WorkerMessageType = JSON.parse(msg.data);
          if (workerMsg.type !== "internal-safe-js-log") {
            this.executing = false;
          }

          workerMessageCallback(workerMsg);
        } catch (_e) {
          this.executing = false;
          this.errorMessageCallback(
            new Error("Unable to parse message from worker")
          );
        }
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
      consoleLogTimeout: this.consoleLogTimeout,
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
      this.errorMessageCallback(
        new Error(
          "Dead worker - This worker has been killed, create another class"
        )
      );
      return;
    }

    this.executing = true;

    // Prevents the worker from running for too long.
    setTimeout(() => {
      if (this.executing) {
        this.worker.terminate();
        this.errorMessageCallback(
          new Error(
            "Worker took too long to complete (Try increasing the MAX_EXECUTING_TIME)"
          )
        );
        this.isAlive = false;
        this.initWorker();
      }
    }, this.MAX_EXECUTING_TIME);

    this.worker.postMessage(code);
  }

  /**
   * Kills the worker, and theefore makes the instance of this
   * class unusable.
   *
   * You can use the @method initWorker to recreate a worker.
   */
  kill() {
    this.isAlive = false;
    this.worker.terminate();
  }
}
