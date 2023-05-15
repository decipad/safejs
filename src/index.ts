import { SafeJs } from "./main";
import "./style.css";

const input = document.getElementById("input") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const execute = document.getElementById("execute") as HTMLButtonElement;

const myWorker = new SafeJs(
  (msg) => {
    output.innerText = msg;
  },
  (err) => console.error(err),
  20000,
  2000
);

execute.onclick = () => {
  myWorker.execute(input.value);
};
