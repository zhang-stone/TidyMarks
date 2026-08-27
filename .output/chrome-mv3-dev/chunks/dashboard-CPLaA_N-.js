//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region node_modules/wxt/dist/virtual/reload-html.mjs
function print(method, ...args) {
	if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
	else method("[wxt]", ...args);
}
/** Wrapper around `console` with a "[wxt]" prefix */
var logger = {
	debug: (...args) => print(console.debug, ...args),
	log: (...args) => print(console.log, ...args),
	warn: (...args) => print(console.warn, ...args),
	error: (...args) => print(console.error, ...args)
};
var ws;
/** Connect to the websocket and listen for messages. */
function getDevServerWebSocket() {
	if (ws == null) {
		const serverUrl = "ws://localhost:3000";
		logger.debug("Connecting to dev server @", serverUrl);
		ws = new WebSocket(serverUrl, "vite-hmr");
		ws.addWxtEventListener = ws.addEventListener.bind(ws);
		ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
			type: "custom",
			event,
			payload
		}));
		ws.addEventListener("open", () => {
			logger.debug("Connected to dev server");
		});
		ws.addEventListener("close", () => {
			logger.debug("Disconnected from dev server");
		});
		ws.addEventListener("error", (event) => {
			logger.error("Failed to connect to dev server", event);
		});
		ws.addEventListener("message", (e) => {
			try {
				const message = JSON.parse(e.data);
				if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
			} catch (err) {
				logger.error("Failed to handle message", err);
			}
		});
	}
	return ws;
}
try {
	getDevServerWebSocket().addWxtEventListener("wxt:reload-page", (event) => {
		if (event.detail === location.pathname.substring(1)) location.reload();
	});
} catch (err) {
	logger.error("Failed to setup web socket connection with dev server", err);
}
//#endregion

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFzaGJvYXJkLUNQTGFBX04tLmpzIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC92aXJ0dWFsL3JlbG9hZC1odG1sLm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvZ2dlci50c1xuZnVuY3Rpb24gcHJpbnQobWV0aG9kLCAuLi5hcmdzKSB7XG5cdGlmIChpbXBvcnQubWV0YS5lbnYuTU9ERSA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybjtcblx0aWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSBtZXRob2QoYFt3eHRdICR7YXJncy5zaGlmdCgpfWAsIC4uLmFyZ3MpO1xuXHRlbHNlIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xufVxuLyoqIFdyYXBwZXIgYXJvdW5kIGBjb25zb2xlYCB3aXRoIGEgXCJbd3h0XVwiIHByZWZpeCAqL1xuY29uc3QgbG9nZ2VyID0ge1xuXHRkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuXHRsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG5cdHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuXHRlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2Rldi1zZXJ2ZXItd2Vic29ja2V0LnRzXG5sZXQgd3M7XG4vKiogQ29ubmVjdCB0byB0aGUgd2Vic29ja2V0IGFuZCBsaXN0ZW4gZm9yIG1lc3NhZ2VzLiAqL1xuZnVuY3Rpb24gZ2V0RGV2U2VydmVyV2ViU29ja2V0KCkge1xuXHRpZiAoaW1wb3J0Lm1ldGEuZW52LkNPTU1BTkQgIT09IFwic2VydmVcIikgdGhyb3cgRXJyb3IoXCJNdXN0IGJlIHJ1bm5pbmcgV1hUIGRldiBjb21tYW5kIHRvIGNvbm5lY3QgdG8gY2FsbCBnZXREZXZTZXJ2ZXJXZWJTb2NrZXQoKVwiKTtcblx0aWYgKHdzID09IG51bGwpIHtcblx0XHRjb25zdCBzZXJ2ZXJVcmwgPSBfX0RFVl9TRVJWRVJfT1JJR0lOX187XG5cdFx0bG9nZ2VyLmRlYnVnKFwiQ29ubmVjdGluZyB0byBkZXYgc2VydmVyIEBcIiwgc2VydmVyVXJsKTtcblx0XHR3cyA9IG5ldyBXZWJTb2NrZXQoc2VydmVyVXJsLCBcInZpdGUtaG1yXCIpO1xuXHRcdHdzLmFkZFd4dEV2ZW50TGlzdGVuZXIgPSB3cy5hZGRFdmVudExpc3RlbmVyLmJpbmQod3MpO1xuXHRcdHdzLnNlbmRDdXN0b20gPSAoZXZlbnQsIHBheWxvYWQpID0+IHdzPy5zZW5kKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHR5cGU6IFwiY3VzdG9tXCIsXG5cdFx0XHRldmVudCxcblx0XHRcdHBheWxvYWRcblx0XHR9KSk7XG5cdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuXHRcdFx0bG9nZ2VyLmRlYnVnKFwiQ29ubmVjdGVkIHRvIGRldiBzZXJ2ZXJcIik7XG5cdFx0fSk7XG5cdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IHtcblx0XHRcdGxvZ2dlci5kZWJ1ZyhcIkRpc2Nvbm5lY3RlZCBmcm9tIGRldiBzZXJ2ZXJcIik7XG5cdFx0fSk7XG5cdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsIChldmVudCkgPT4ge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFwiRmFpbGVkIHRvIGNvbm5lY3QgdG8gZGV2IHNlcnZlclwiLCBldmVudCk7XG5cdFx0fSk7XG5cdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGUpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBKU09OLnBhcnNlKGUuZGF0YSk7XG5cdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09IFwiY3VzdG9tXCIpIHdzPy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChtZXNzYWdlLmV2ZW50LCB7IGRldGFpbDogbWVzc2FnZS5kYXRhIH0pKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dnZXIuZXJyb3IoXCJGYWlsZWQgdG8gaGFuZGxlIG1lc3NhZ2VcIiwgZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gd3M7XG59XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBzcmMvdmlydHVhbC9yZWxvYWQtaHRtbC50c1xuaWYgKGltcG9ydC5tZXRhLmVudi5DT01NQU5EID09PSBcInNlcnZlXCIpIHRyeSB7XG5cdGdldERldlNlcnZlcldlYlNvY2tldCgpLmFkZFd4dEV2ZW50TGlzdGVuZXIoXCJ3eHQ6cmVsb2FkLXBhZ2VcIiwgKGV2ZW50KSA9PiB7XG5cdFx0aWYgKGV2ZW50LmRldGFpbCA9PT0gbG9jYXRpb24ucGF0aG5hbWUuc3Vic3RyaW5nKDEpKSBsb2NhdGlvbi5yZWxvYWQoKTtcblx0fSk7XG59IGNhdGNoIChlcnIpIHtcblx0bG9nZ2VyLmVycm9yKFwiRmFpbGVkIHRvIHNldHVwIHdlYiBzb2NrZXQgY29ubmVjdGlvbiB3aXRoIGRldiBzZXJ2ZXJcIiwgZXJyKTtcbn1cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHt9O1xuIl0sInhfZ29vZ2xlX2lnbm9yZUxpc3QiOlswXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsU0FBUyxNQUFNLFFBQVEsR0FBRyxNQUFNO0NBRS9CLElBQUksT0FBTyxLQUFLLE9BQU8sVUFBVSxPQUFPLFNBQVMsS0FBSyxNQUFNLEtBQUssR0FBRyxJQUFJO01BQ25FLE9BQU8sU0FBUyxHQUFHLElBQUk7QUFDN0I7O0FBRUEsSUFBTSxTQUFTO0NBQ2QsUUFBUSxHQUFHLFNBQVMsTUFBTSxRQUFRLE9BQU8sR0FBRyxJQUFJO0NBQ2hELE1BQU0sR0FBRyxTQUFTLE1BQU0sUUFBUSxLQUFLLEdBQUcsSUFBSTtDQUM1QyxPQUFPLEdBQUcsU0FBUyxNQUFNLFFBQVEsTUFBTSxHQUFHLElBQUk7Q0FDOUMsUUFBUSxHQUFHLFNBQVMsTUFBTSxRQUFRLE9BQU8sR0FBRyxJQUFJO0FBQ2pEO0FBR0EsSUFBSTs7QUFFSixTQUFTLHdCQUF3QjtDQUVoQyxJQUFJLE1BQU0sTUFBTTtFQUNmLE1BQU0sWUFBQTtFQUNOLE9BQU8sTUFBTSw4QkFBOEIsU0FBUztFQUNwRCxLQUFLLElBQUksVUFBVSxXQUFXLFVBQVU7RUFDeEMsR0FBRyxzQkFBc0IsR0FBRyxpQkFBaUIsS0FBSyxFQUFFO0VBQ3BELEdBQUcsY0FBYyxPQUFPLFlBQVksSUFBSSxLQUFLLEtBQUssVUFBVTtHQUMzRCxNQUFNO0dBQ047R0FDQTtFQUNELENBQUMsQ0FBQztFQUNGLEdBQUcsaUJBQWlCLGNBQWM7R0FDakMsT0FBTyxNQUFNLHlCQUF5QjtFQUN2QyxDQUFDO0VBQ0QsR0FBRyxpQkFBaUIsZUFBZTtHQUNsQyxPQUFPLE1BQU0sOEJBQThCO0VBQzVDLENBQUM7RUFDRCxHQUFHLGlCQUFpQixVQUFVLFVBQVU7R0FDdkMsT0FBTyxNQUFNLG1DQUFtQyxLQUFLO0VBQ3RELENBQUM7RUFDRCxHQUFHLGlCQUFpQixZQUFZLE1BQU07R0FDckMsSUFBSTtJQUNILE1BQU0sVUFBVSxLQUFLLE1BQU0sRUFBRSxJQUFJO0lBQ2pDLElBQUksUUFBUSxTQUFTLFVBQVUsSUFBSSxjQUFjLElBQUksWUFBWSxRQUFRLE9BQU8sRUFBRSxRQUFRLFFBQVEsS0FBSyxDQUFDLENBQUM7R0FDMUcsU0FBUyxLQUFLO0lBQ2IsT0FBTyxNQUFNLDRCQUE0QixHQUFHO0dBQzdDO0VBQ0QsQ0FBQztDQUNGO0NBQ0EsT0FBTztBQUNSO0FBR3lDLElBQUk7Q0FDNUMsc0JBQXNCLENBQUMsQ0FBQyxvQkFBb0Isb0JBQW9CLFVBQVU7RUFDekUsSUFBSSxNQUFNLFdBQVcsU0FBUyxTQUFTLFVBQVUsQ0FBQyxHQUFHLFNBQVMsT0FBTztDQUN0RSxDQUFDO0FBQ0YsU0FBUyxLQUFLO0NBQ2IsT0FBTyxNQUFNLHlEQUF5RCxHQUFHO0FBQzFFIn0=