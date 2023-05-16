import MyWorker from "./worker?worker&inline";

interface SafeJsOptions {
  maxWorkerReturn: number;
  maxExecutingTime: number;
  extraWhitelist: Array<string>;
}

export type WorkerInitMessage = Omit<SafeJsOptions, "maxExecutingTime">;

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
  private errorMessageCallback: (err: Error) => void;
  private handleMessages: (msg: any) => void;

  private MAX_WORKER_RETURN: number = 20000;
  private MAX_EXECUTING_TIME: number = 10000;

  private extraWhitelist: Array<string> = [];

  /**
   * @param workerMessageCallback
   * @param maxWorkerReturn the max size of the stringified return from the worker
   */
  constructor(
    workerMessageCallback: (res: string) => void,
    workerErrorCallback: (err: Error) => void,
    {
      maxWorkerReturn,
      maxExecutingTime,
      extraWhitelist,
    }: Readonly<Partial<SafeJsOptions>>
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

    this.handleMessages = (msg) => {
      this.executing = false;
      if (msg.data instanceof Error) {
        this.errorMessageCallback(msg.data);
      } else if (typeof msg.data === "string") {
        workerMessageCallback(msg.data);
      }
    };

    this.initWorker();
  }

  // initialised the worked, used by constructor and when execution of worker takes too long.
  private initWorker() {
    this.worker = new MyWorker();
    this.channel = new MessageChannel();

    const firstMessage: WorkerInitMessage = {
      maxWorkerReturn: this.MAX_WORKER_RETURN,
      extraWhitelist: this.extraWhitelist,
    };

    this.worker.postMessage(firstMessage, [this.channel.port2]);
    this.channel.port1.onmessage = this.handleMessages;
  }

  /**
   * @param code - The actual JS you want to execute in the worker
   * @returns nothing, because the `workerMessageCallback` will be used to return the result.
   */
  async execute(code: string) {
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
        this.initWorker();
      }
    }, this.MAX_EXECUTING_TIME);

    this.worker.postMessage(code);
  }
}
