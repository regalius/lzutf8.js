﻿namespace LZUTF8
{
	export class WebWorker
	{
		static compressAsync(input: any, options: CompressionOptions, callback: (result: any, error?: Error) => void)
		{
			let requestInputEncoding = options.inputEncoding;
			let requestOutputEncoding = options.outputEncoding;

			if (!WebWorker.supportsTransferableObjects)
			{
				if (options.inputEncoding == "ByteArray")
				{
					try
					{
						input = decodeUTF8(input);
					}
					catch (e)
					{
						callback(undefined, e);
						return;
					}

					requestInputEncoding = "String";
				}

				if (options.outputEncoding == "ByteArray")
				{
					requestOutputEncoding = "BinaryString";
				}
			}
			else
			{
				if (options.inputEncoding == "ByteArray")
				{
					if (!(input instanceof Uint8Array))
					{
						callback(undefined, new TypeError("compressAsync: input is not a Uint8Array"));
						return;
					}
				}
			}

			let request: WebWorkerMessage =
				{
					token: Math.random().toString(),
					type: "compress",
					data: input,
					inputEncoding: requestInputEncoding,
					outputEncoding: requestOutputEncoding
				};

			if (request.inputEncoding == "ByteArray")
				WebWorker.globalWorker.postMessage(request, [(new Uint8Array(request.data)).buffer]);
			else
				WebWorker.globalWorker.postMessage(request, []);


			let responseListener = (e) =>
			{
				let response: WebWorkerMessage = e.data;

				if (!response || response.token != request.token)
					return;

				WebWorker.globalWorker.removeEventListener("message", responseListener);

				//
				if (options.outputEncoding == "ByteArray" && response.inputEncoding == "BinaryString")
					response.data = decodeBinaryString(response.data);

				enqueueImmediate(() => callback(response.data));
			}

			WebWorker.globalWorker.addEventListener("message", responseListener);
			WebWorker.globalWorker.addEventListener("error",(e) => { callback(undefined, <any> e) });
		}

		static decompressAsync(input: any, options: CompressionOptions, callback: (result: any, error?: Error) => void)
		{
			let requestInputEncoding = options.inputEncoding;
			let requestOutputEncoding = options.outputEncoding;

			if (!WebWorker.supportsTransferableObjects)
			{
				if (options.inputEncoding == "ByteArray")
				{
					try
					{
						input = encodeBinaryString(input);
					}
					catch (e)
					{
						callback(undefined, e);
						return;
					}

					requestInputEncoding = "BinaryString";
				}

				if (options.outputEncoding == "ByteArray")
				{
					requestOutputEncoding = "String";
				}
			}

			let request: WebWorkerMessage =
				{
					token: Math.random().toString(),
					type: "decompress",
					data: input,
					inputEncoding: requestInputEncoding,
					outputEncoding: requestOutputEncoding
				};

			//
			if (request.inputEncoding == "ByteArray")
				WebWorker.globalWorker.postMessage(request, [(new Uint8Array(request.data)).buffer]);
			else
				WebWorker.globalWorker.postMessage(request, []);
			//

			let responseListener = (e) =>
			{
				let response: WebWorkerMessage = e.data;

				if (!response || response.token != request.token)
					return;

				WebWorker.globalWorker.removeEventListener("message", responseListener);

				if (options.outputEncoding == "ByteArray" && response.inputEncoding == "String")
					response.data = encodeUTF8(response.data);

				enqueueImmediate(() => callback(response.data));
			};

			WebWorker.globalWorker.addEventListener("message", responseListener);
			WebWorker.globalWorker.addEventListener("error",(e) => { callback(undefined, <any> e) });
		}
		
		// Worker internal handler
		static workerMessageHandler(e: MessageEvent)
		{
			let request: WebWorkerMessage = e.data;

			if (request.type == "compress")
			{
				let compressedData = compress(request.data, { outputEncoding: request.outputEncoding });

				let response: WebWorkerMessage =
					{
						token: request.token,
						type: "compressionResult",
						data: compressedData,
						inputEncoding: request.outputEncoding,
					};

				if (response.inputEncoding == "ByteArray")
					self.postMessage(response, <any>[compressedData.buffer]);
				else
					self.postMessage(response, <any>[]);
			}
			else if (request.type == "decompress")
			{
				let decompressedData = decompress(request.data, { inputEncoding: request.inputEncoding, outputEncoding: request.outputEncoding });

				let response: WebWorkerMessage =
					{
						token: request.token,
						type: "decompressionResult",
						data: decompressedData,
						inputEncoding: request.outputEncoding,
					};

				if (response.inputEncoding == "ByteArray")
					self.postMessage(response, <any>[decompressedData.buffer]);
				else
					self.postMessage(response, <any>[]);
			}
		}

		static registerListenerIfRunningInWebWorker()
		{
			if (typeof self == "object" && self.document === undefined && self.addEventListener != undefined)
			{
				self.addEventListener("message", WebWorker.workerMessageHandler);

				self.addEventListener("error", (e: ErrorEvent) =>
				{
					log("LZUTF8 WebWorker exception: " + e.message);
				});
			}
		}

		static createGlobalWorkerIfItDoesntExist()
		{
			if (WebWorker.globalWorker)
				return;

			if (!WebWorker.isSupported())
				throw new Error("createGlobalWorkerIfItDoesntExist: Web workers are not supported or script source is not available");

			if (!WebWorker.scriptURI)
				WebWorker.scriptURI = document.getElementById("lzutf8").getAttribute("src");

			WebWorker.globalWorker = new Worker(WebWorker.scriptURI);
			WebWorker.supportsTransferableObjects = WebWorker.testSupportForTransferableObjects();

			//log("WebWorker.supportsTransferableObjects = " + WebWorker.supportsTransferableObjects);
		}

		static isSupported()
		{
			if (WebWorker.globalWorker)
				return true;

			if (!webWorkersAvailable())
				return false;

			if (WebWorker.scriptURI)
				return true;

			let scriptElement = document.getElementById("lzutf8");

			if (!scriptElement || scriptElement.tagName != "SCRIPT")
			{
				log("Cannot use a web worker as no script element with id 'lzutf8' was found in the page");
				return false;
			}

			return true;
		}

		static testSupportForTransferableObjects(): boolean
		{
			if (typeof Uint8Array == "undefined")
				return false;

			if (!WebWorker.globalWorker)
				throw new Error("testSupportForTransferableObjects: No global worker created");

			// Test if web worker implementation support transferable objects (Chrome 21+, Firefox 18+, Safari 6+)
			let testArrayBuffer = new ArrayBuffer(1);

			let result: boolean;
			try
			{
				WebWorker.globalWorker.postMessage(testArrayBuffer, [testArrayBuffer]);
			}
			catch (e)
			{
				return false;
			}

			return (testArrayBuffer.byteLength === 0);
		}

		static terminate()
		{
			if (WebWorker.globalWorker)
			{
				WebWorker.globalWorker.terminate();
				WebWorker.globalWorker = undefined;
			}
		}

		static globalWorker: Worker;
		static supportsTransferableObjects: boolean;
		static scriptURI: string;
	}

	interface WebWorkerMessage
	{
		token: string;
		type: string;
		data: any;
		inputEncoding?: string;
		outputEncoding?: string;
	}

	// Crate global worker (if available) when the page loads
	//if (typeof document == "object")
	//	document.addEventListener("DOMContentLoaded", () => WebWorker.createGlobalWorkerIfItDoesntExist());

	// Install listener during script load if inside a worker
	WebWorker.registerListenerIfRunningInWebWorker();
}