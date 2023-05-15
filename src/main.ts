// Load Web Workers
import WorkerFile from "./worker.ts?worker";

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
