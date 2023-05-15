import { SafeJs } from "./main";

const myWorker = new SafeJs(
  (msg) => console.log(msg),
  (err) => console.error(err)
);
