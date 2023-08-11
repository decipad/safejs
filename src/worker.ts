import { WorkerInitMessage, WorkerMessage, WorkerMessageType } from "./main";

declare global {
  interface Window {
    fetchProxy: any;
  }
}

type MyRequest = Omit<Request, "body" | "headers" | "signal"> & {
  body: string;
  isBase64Encoded?: boolean;
  method: Request["method"];
  headers: Record<string, string>;
  signal: never;
};

function SecureProperty(parent: object, property: string) {
  try {
    Object.defineProperty(parent, property, {
      get() {
        throw new Error("Security Exception - cannot access: " + property);
      },
      configurable: false,
    });
  } catch (e) {
    // Do nothing
  }
}

function initialize(
  extraWhitelist: Array<string>,
  consoleCallback: (m: string | Error) => void,
  fetchProxyUrl?: string
) {
  const whitelist: string[] = [
    "self",
    "postMessage",
    "global",
    "whiteList",
    "Array",
    "Boolean",
    "Date",
    "Function",
    "Promise",
    "Number",
    "Object",
    "RegExp",
    "String",
    "Error",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "Infinity",
    "JSON",
    "Math",
    "Map",
    "NaN",
    "undefined",
    "DOMParser",
    "btoa",
    "Uint8Array",

    "Intl",
    "constructor",
    "fetch",
    "Request",

    // Special, because we strip most of it
    "console",

    ...extraWhitelist,
  ];

  /**
   * Start by stripping the global `self` object of all properties EXCEPT
   * the ones in the whitelist.
   */
  for (const prop in self) {
    if (whitelist.includes(prop)) {
      continue;
    }

    SecureProperty(self, prop);
  }

  const arProt = Array.prototype;

  // Creating an array with too many items, could crash the worker.
  // @ts-ignore
  Array = function (args) {
    if (args && args > 500) {
      throw "Exception: too many items";
    }
    return arProt.constructor(args);
  };
  // @ts-ignore
  Array.prototype = arProt;

  for (const prop in console) {
    if (prop === "log") {
      continue;
    }

    SecureProperty(console, prop);
  }

  const originalFetch = self.fetch;

  if (fetchProxyUrl) {
    self.fetch = async function (...originalArgs) {
      const req = new Request(...originalArgs);

      let awaitJson = undefined;
      try {
        awaitJson = await req.json();
        console.log(awaitJson);
      } catch (err) {
        // Do nothing;
      }

      const bodyObject = {
        ...req,

        method: req.method,

        headers: Object.fromEntries(req.headers.entries()),
        url: req.url,

        ...(typeof awaitJson === "string" && {
          body: JSON.stringify(awaitJson),
        }),
        isBase64Encoded: false,
      } as MyRequest;

      return originalFetch(fetchProxyUrl, {
        method: "POST",
        body: JSON.stringify(bodyObject),
      });
    };
  }

  /**
   * Overriding console to push onto an array instead.
   * Otherwise the user can avoid the default console.
   * And prevents us from displaying them nicely.
   */
  /*
  console.log = function (arg) {
    try {
      switch (typeof arg) {
        case "number":
        case "string":
        case "bigint":
          consoleCallback(arg.toString());
          break;
        case "boolean":
          consoleCallback(String(arg));
          break;
        case "undefined":
          consoleCallback("null");
          break;
        case "object":
          consoleCallback(JSON.stringify(arg));
          break;
        default:
          consoleCallback(new Error("Cannot log this type"));
      }
    } catch (e) {
      consoleCallback(new Error("console.log went wrong somewhere"));
    }
  };
  */

  function removeProto(currentProto: any) {
    Object.getOwnPropertyNames(currentProto).forEach((prop) => {
      if (prop in whitelist) return;
      if (prop === "self") return;

      SecureProperty(currentProto, prop);
    });
  }

  // @ts-ignore
  removeProto(self.__proto__);
  // @ts-ignore
  removeProto(self.__proto__.__proto__);
}

let port: MessagePort;
let MAX_RETURN = 20000;
let MAX_CONSOLE = 200;
let logs: Array<string> = [];

self.onmessage = async (msg) => {
  logs = [];
  function workerMessages(m: string | Error) {
    if (logs.length > MAX_CONSOLE) {
      logs.splice(-MAX_CONSOLE);
    } else {
      logs.push(typeof m === "string" ? m : "error: " + m.message);
    }
  }

  if (msg.ports.length > 0 && port == null) {
    const initMessage = msg.data as WorkerInitMessage;
    MAX_RETURN = initMessage.maxWorkerReturn;
    MAX_CONSOLE = initMessage.maxConsoleLog;
    port = msg.ports[0];

    initialize(
      initMessage.extraWhitelist,
      workerMessages,
      initMessage.fetchProxyUrl
    );
    return;
  }

  try {
    const workerMessage: WorkerMessage = msg.data;

    const result = await Object.getPrototypeOf(async function () {})
      .constructor(workerMessage.code)
      .bind(workerMessage.params)();

    // JSON.stringify can yield undefined when result is undefined
    const parsedResult: string | undefined = JSON.stringify(result);

    // Partial to allow for "typesafe" assignment of result parameter to string/error.
    const returnMessage: Partial<WorkerMessageType> = {
      logs: [],
    };

    if (!parsedResult) {
      // JSON.parse fails on `undefined`, but not on `null`.
      returnMessage.result = "null";
    } else if (parsedResult.length > MAX_RETURN) {
      returnMessage.result = new Error(
        "Worker result is past the max allowed length (Try increasing the length when creating the worker object)"
      );
    } else {
      returnMessage.result = parsedResult;
    }

    returnMessage.logs = logs.slice(-MAX_CONSOLE);
    port.postMessage(JSON.stringify(returnMessage));
  } catch (e) {
    port.postMessage(e);
    return;
  }
};
