const channel = new MessageChannel();
channel.port1.onmessage = (msg) => {
  console.log(msg);
};

// Load Web Workers

import WorkerFile from "./worker.ts?worker";
const worker = new WorkerFile();

worker.postMessage("", [channel.port2]);
