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

function initialize(
  extraWhitelist: Array<string>,
  consoleCallback: (m: string | Error) => void,
  fetchProxyUrl?: string
) {
  const extraWhitelistObject = {} as any;
  for (const v of extraWhitelist) {
    extraWhitelistObject[v] = 1;
  }

  const whitelist = {
    self: 1,
    postMessage: 1,
    global: 1,
    whiteList: 1,
    Array: 1,
    Boolean: 1,
    Date: 1,
    Function: 1,
    Promise: 1,
    Number: 1,
    Object: 1,
    RegExp: 1,
    String: 1,
    Error: 1,
    RangeError: 1,
    ReferenceError: 1,
    SyntaxError: 1,
    TypeError: 1,
    URIError: 1,
    decodeURI: 1,
    decodeURIComponent: 1,
    encodeURI: 1,
    isFinite: 1,
    isNaN: 1,
    parseFloat: 1,
    parseInt: 1,
    Infinity: 1,
    JSON: 1,
    Math: 1,
    NaN: 1,
    undefined: 1,
    Map: 1,
    DOMParser: 1,
    Proxy: 1,
    btoa: 1,
    Uint8Array: 1,

    Intl: 1,
    constructor: 1,
    fetch: 1,
    Request: 1,

    // Special, because we strip most of it
    console: 1,

    ...extraWhitelistObject,
  };

  Object.getOwnPropertyNames(self).forEach((prop) => {
    if (prop in whitelist) return;

    try {
      Object.defineProperty(self, prop, {
        get: function () {
          throw new Error("Security Exception - cannot access: " + prop);
        },
        configurable: false,
      });
    } catch (e) {}
  });

  // @ts-ignore
  Object.defineProperty(Array.prototype, "join", {
    writable: false,
    configurable: false,
    value: (function (old) {
      // @ts-ignore
      return function (arg) {
        // @ts-ignore
        if (this.length > 500 || (arg && arg.length > 500)) {
          throw "Exception: too many items";
        }

        // @ts-ignore
        return old.apply(this, arguments);
      };
    })(Array.prototype.join),
  });

  const arProt = Array.prototype;

  // @ts-ignore
  Array = function (args) {
    if (args && args > 500) {
      throw "Exception: too many items";
    }
    return arProt.constructor(args);
  };

  // @ts-ignore
  Array.prototype = arProt;

  Object.getOwnPropertyNames(console).forEach((prop) => {
    if (prop !== "log") {
      Object.defineProperty(console, prop, {
        configurable: false,
        get: function () {
          throw new Error("Security Exception - cannot access: " + prop);
        },
      });
    }
  });

  function _arrayBufferToBase64(buffer: ArrayBuffer) {
    var binary = "";
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  const originalFetch = self.fetch;

  if (fetchProxyUrl) {
    self.fetch = async function (...originalArgs) {
      const req = new Request(...originalArgs);

      const awaitedBuffer = await req.arrayBuffer();
      const hasBody = awaitedBuffer.byteLength > 0;

      const bodyObject = {
        ...req,

        method: req.method,

        headers: Object.fromEntries(req.headers.entries()),
        url: req.url,

        ...(hasBody && { body: _arrayBufferToBase64(awaitedBuffer) }),
        isBase64Encoded: true,
      } as MyRequest;

      return originalFetch(fetchProxyUrl, {
        method: "POST",
        body: JSON.stringify(bodyObject),
      });
    };
  }

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

  function removeProto(currentProto: any) {
    Object.getOwnPropertyNames(currentProto).forEach((prop) => {
      // Just for testing
      if (prop in whitelist) return;
      if (prop === "self") return;

      try {
        Object.defineProperty(currentProto, prop, {
          get: () => {
            throw new Error("Security Exception - cannot access: " + prop);
          },
          configurable: false,
        });
      } catch (e) {
        // console.log(e);
      }
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
