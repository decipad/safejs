// Load Web Workers
import WorkerFile from "./worker.ts?worker";

/**
 * SafeJs is a way to run safe user-provided JavaScript code in a web worker.
 * The web worker has no access to DOM or window object, see [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), and we go even further by re-writing the `get` method of many web worker function to throw error, making them unusable.
 * We also restrict the `prototype` of the `self` object in the web worker, making the execution of the code safe.
 * There is also a whitelist which allows the web worker to define what functions are allowed (for example decipads usecase needs `fetch`, but you might not want to allow this).
 */
export class SafeJs {
  // @ts-ignore - Typescript doesnt seem to know `this.worker` is initialised in a private function.
  private worker: Worker;
  private channel: MessageChannel;
  private executing: boolean;
  private errorMessageCallback: (err: Error) => void;

  private MAX_WORKER_RETURN: number = 20000;
  private MAX_EXECUTING_TIME: number = 10000;

  /**
   * @param workerMessageCallback
   * @param maxWorkerReturn the max size of the stringified return from the worker
   */
  constructor(
    workerMessageCallback: (res: string) => void,
    workerErrorCallback: (err: Error) => void,
    maxWorkerReturn?: number,
    maxExecutingTime?: number
  ) {
    this.channel = new MessageChannel();
    this.executing = false;
    this.errorMessageCallback = workerErrorCallback;

    if (maxWorkerReturn) {
      this.MAX_WORKER_RETURN = maxWorkerReturn;
    }

    if (maxExecutingTime) {
      this.MAX_EXECUTING_TIME = maxExecutingTime;
    }

    this.initWorker();

    this.channel.port1.onmessage = (msg) => {
      if (msg.data instanceof Error) {
        this.errorMessageCallback(msg.data);
      } else if (typeof msg.data === "string") {
        workerMessageCallback(msg.data);
      }
    };
  }

  // initialised the worked, used by constructor and when execution of worker takes too long.
  private initWorker() {
    this.worker = new WorkerFile();
    this.worker.postMessage(this.MAX_WORKER_RETURN, [this.channel.port2]);
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
