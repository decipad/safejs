import { SafeJs } from "./main";
import "./style.css";

const input = document.getElementById("input") as HTMLTextAreaElement;
const paramsInput = document.getElementById(
  "params-input"
) as HTMLTextAreaElement;
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
    maxExecutingTime: 50000,
    fetchProxyUrl: "https://mywebsite.com/proxy_endpoint?request=",
  }
);

execute.onclick = () => {
  try {
    const params = JSON.parse(
      paramsInput.value.length > 0 ? paramsInput.value : "{}"
    );
    if (typeof params === "object") {
      myWorker.execute(input.value, params);
    } else {
      console.error("Params need to be good JSON");
    }
  } catch (e) {
    console.error("Params need to be good JSON");
  }
};
