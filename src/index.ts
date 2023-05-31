import { SafeJs, WorkerMessageType } from "./main";
import "./style.css";

const input = document.getElementById("input") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const execute = document.getElementById("execute") as HTMLButtonElement;

const myWorker = new SafeJs(
  (msg) => {
    const parsedMsg: WorkerMessageType = JSON.parse(msg);
    if (parsedMsg.type === "internal-safe-js-log") {
      output.innerHTML += `<span>CONSOLE.LOG: ${parsedMsg.message}</span>`;
    } else {
      output.innerHTML += `<span>${parsedMsg.message}</span>`;
    }
  },
  (err) => console.error(err),
  {
    maxExecutingTime: 1000000,
  }
);

execute.onclick = () => {
  myWorker.execute(input.value);
};
