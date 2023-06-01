import { SafeJs } from "./main";
import "./style.css";

const input = document.getElementById("input") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const execute = document.getElementById("execute") as HTMLButtonElement;

const myWorker = new SafeJs(
  (msg) => {
    console.log(msg);
    output.innerHTML += `<span>${msg.result}</span>`;
    for (const log of msg.logs) {
      output.innerHTML += `<span>LOG: ${log}</span>`;
    }
  },
  (err) => console.error(err),
  {
    maxExecutingTime: 5000,
  }
);

execute.onclick = () => {
  myWorker.execute(input.value);
};
