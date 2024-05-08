import MyWorker from "./worker?worker&inline";

export interface SafeJsOptions {
  maxWorkerReturn: number;
  maxExecutingTime: number;
  maxConsoleLog: number;
  extraWhitelist: Array<string>;

  fetchProxyUrl: string | undefined;
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

export interface WorkerMessage {
  code: string;
  params?: object;
}

/**
 * SafeJs is a way to run safe user-provided JavaScript code in a web worker.
 * The web worker has no access to DOM or window object, see [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), and we go even further by re-writing the `get` method of many web worker function to throw error, making them unusable.
 * We also restrict the `prototype` of the `self` object in the web worker, making the execution of the code safe.
 * There is also a whitelist which allows the web worker to define what functions are allowed (for example decipads usecase needs `fetch`, but you might not want to allow this).
 *
 * We provide a setup function, but this is not ran on the main thread, it is ran on the worker side.
 */
export class SafeJs implements SafeJsOptions {
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

  // Used to allow `execute` to return a promise.
  private responsePromise?: {
    resolve: (res?: string) => void;
    reject: (res?: any) => void;
  };

  public maxWorkerReturn: number = 10000;
  public maxExecutingTime: number = 20000;
  public maxConsoleLog: number = 200;
  public extraWhitelist: Array<string> = [];
  public fetchProxyUrl: string | undefined;

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
      fetchProxyUrl,
    }: Readonly<Partial<SafeJsOptions>> = {},
  ) {
    this.executing = false;
    this.errorMessageCallback = workerErrorCallback;

    if (maxWorkerReturn) {
      this.maxWorkerReturn = maxWorkerReturn;
    }

    if (maxExecutingTime) {
      this.maxExecutingTime = maxExecutingTime;
    }

    if (extraWhitelist) {
      this.extraWhitelist = extraWhitelist;
    }

    if (maxConsoleLog) {
      this.maxConsoleLog = maxConsoleLog;
    }

    if (fetchProxyUrl) {
      this.fetchProxyUrl = fetchProxyUrl;
    }

    this.handleMessages = (msg: MessageEvent<SyntaxError | string>) => {
      this.executing = false;

      if (msg.data instanceof Error) {
        this.errorMessageCallback({
          result: new Error(msg.data.message),
          logs: [],
        });

        this.responsePromise?.reject(new Error(msg.data.message));
        return;
      }

      try {
        const workerMsg: WorkerMessageType = JSON.parse(msg.data);
        this.executing = false;

        if (typeof workerMsg.result === "string") {
          workerMessageCallback(workerMsg as ResultMessageType);
          this.responsePromise?.resolve(workerMsg.result);
        } else {
          this.errorMessageCallback(workerMsg as ErrorMessageType);
          this.responsePromise?.reject(workerMsg.result);
        }
      } catch (err) {
        this.executing = false;
        this.errorMessageCallback({
          result: new Error("Unable to parse message from worker: " + err),
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
      maxWorkerReturn: this.maxWorkerReturn,
      extraWhitelist: this.extraWhitelist,
      maxConsoleLog: this.maxConsoleLog,
      fetchProxyUrl: this.fetchProxyUrl,
    };

    this.worker.postMessage(firstMessage, [this.channel.port2]);
    this.channel.port1.onmessage = this.handleMessages;

    this.isAlive = true;
  }

  /**
   * @param code - The actual JS you want to execute in the worker
   * @returns nothing, because the `workerMessageCallback` will be used to return the result.
   */
  async execute(
    code: string,
    params?: object,
  ): Promise<string | Error | undefined> {
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
    }, this.maxExecutingTime);

    const msg: WorkerMessage = {
      code,
      params,
    };

    this.worker.postMessage(msg);

    return new Promise((resolve, reject) => {
      this.responsePromise = {
        resolve,
        reject,
      };
    });
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
