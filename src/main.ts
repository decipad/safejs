// Load Web Workers
import WorkerFile from "./worker.ts?worker";

/** SafeJs is a way to run safe user-provided JavaScript code in a web worker.
 * The web worker has no access to DOM or window object, see [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), and we go even further by re-writing the `get` method of many web worker function to throw error, making them unusable.
 * We also restrict the `prototype` of the `self` object in the web worker, making the execution of the code safe.
 * There is also a whitelist which allows the web worker to define what functions are allowed (for example decipads usecase needs `fetch`, but you might not want to allow this).
 */
export class SafeJs {
  private worker: Worker;
  private channel: MessageChannel;

  /**
   * @param workerMessageCallback
   * @param maxWorkerReturn the max size of the stringified return from the worker
   */
  constructor(
    workerMessageCallback: (res: string) => void,
    workerErrorCallback: (err: Error) => void,
    maxWorkerReturn?: number
  ) {
    this.worker = new WorkerFile();
    this.channel = new MessageChannel();

    this.worker.postMessage(maxWorkerReturn ?? "", [this.channel.port2]);

    this.channel.port1.onmessage = (msg) => {
      if (msg.data instanceof Error) {
        workerErrorCallback(msg.data);
      } else if (typeof msg.data === "string") {
        workerMessageCallback(msg.data);
      }
    };
  }

  /**
   * @param code - The actual JS you want to execute in the worker
   * @returns nothing, because the `workerMessageCallback` will be used to return the result.
   */
  async execute(code: string) {
    this.worker.postMessage(code);
  }
}
