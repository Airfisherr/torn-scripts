// ==UserScript==
// @name         Torn Friends Filter
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  Adds filter options on the friends list
// @author       Airfisher
// @match        https://www.torn.com/page.php?sid=list&type=friends
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	// ========== CONFIGURATION ==========
	const CONFIG = {
		debug: false,
		retryAttempts: 10,
		retryDelay: 500,
		containerSelector: "#users-list-root",
		customDivId: "torn-friends-custom-div",
	};

	// ========== LOGGER ==========
	const Logger = {
		log: function (message) {
			if (CONFIG.debug) {
				console.log(
					"[Torn Friends Filter]:",
					message,
					new Date().toLocaleTimeString(),
				);
			}
		},
		error: function (message) {
			console.error(
				"[Torn Friends Filter ERROR]:",
				message,
				new Date().toLocaleTimeString(),
			);
		},
		info: function (message) {
			if (CONFIG.debug) {
				console.info(
					"[Torn Friends Filter]:",
					message,
					new Date().toLocaleTimeString(),
				);
			}
		},
		warn: function (message) {
			console.warn(
				"[Torn Friends Filter WARNING]:",
				message,
				new Date().toLocaleTimeString(),
			);
		},
	};

	// ========== DOM UTILITIES ==========
	const DOMUtils = {
		waitForElement: function (
			selector,
			maxAttempts = CONFIG.retryAttempts,
			interval = CONFIG.retryDelay,
		) {
			return new Promise((resolve) => {
				let attempts = 0;

				const checkElement = () => {
					attempts++;
					const element = document.querySelector(selector);

					if (element) {
						Logger.log(`Found element with selector: ${selector}`);
						resolve(element);
					} else if (attempts >= maxAttempts) {
						Logger.log(`Element not found after ${maxAttempts} attempts`);
						resolve(null);
					} else {
						setTimeout(checkElement, interval);
					}
				};

				checkElement();
			});
		},
	};

	// ========== FILTER FUNCTIONALITY ==========
	const FilterManager = {
		currentFilter: "all",

		getFriendRows: function () {
			return document.querySelectorAll(".tableRow___UgA6S");
		},

		getUserStatus: function (row) {
			// Find the status div with aria-label
			const statusDiv = row.querySelector(".userStatusWrap___ljSJG");

			if (statusDiv) {
				const ariaLabel = statusDiv.getAttribute("aria-label") || "";

				if (ariaLabel.includes(" is online")) return "online";
				if (ariaLabel.includes(" is offline")) return "offline";
				if (ariaLabel.includes(" is idle")) return "idle";
			}

			const statusElement = row.querySelector(
				".status___o6u8R span:not(.srOnly____XztU)",
			);
			if (statusElement) {
				const status = statusElement.textContent.trim().toLowerCase();
				if (status === "okay") return "online";
				if (status === "hospital" || status === "jail" || status === "federal")
					return "offline";
				return status;
			}

			return "unknown";
		},

		applyFilter: function (filterValue) {
			this.currentFilter = filterValue;
			Logger.log(`Applying filter: ${filterValue}`);

			const rows = this.getFriendRows();

			rows.forEach((row) => {
				if (filterValue === "all") {
					row.style.display = "";
					return;
				}

				const status = this.getUserStatus(row);
				let shouldShow = false;

				switch (filterValue) {
					case "online":
						shouldShow = status === "online";
						break;
					case "idle":
						shouldShow = status === "idle";
						break;
					case "offline":
						shouldShow = status === "offline";
						break;
					default:
						shouldShow = true;
				}

				row.style.display = shouldShow ? "" : "none";
			});
		},
	};

	// ========== CUSTOM DIV DISPLAY ==========
	const CustomDivDisplay = {
		isAdded: false,
		customDiv: null,
		retryCount: 0,
		observer: null,
		observerDisconnected: false,

		init: function () {
			if (!window.location.href.includes("page.php?sid=list&type=friends")) {
				Logger.log("Not on friends list page, exiting");
				return;
			}

			setTimeout(() => this.attemptInsertion(), 1000);
			this.setupObserver();
		},

		setupObserver: function () {
			if (this.observerDisconnected) return;

			let debounceTimer;

			this.observer = new MutationObserver((mutations) => {
				const ourDivAdded = Array.from(mutations).some((mutation) => {
					return Array.from(mutation.addedNodes).some(
						(node) => node.id === CONFIG.customDivId,
					);
				});

				if (ourDivAdded) {
					Logger.log("Ignoring mutation that added our own div");
					return;
				}

				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					if (!this.isAdded && !this.observerDisconnected) {
						this.attemptInsertion();
					}
				}, 500);
			});

			this.observer.observe(document.body, {
				childList: true,
				subtree: true,
			});

			Logger.log("Observer attached to body");
		},

		attemptInsertion: function () {
			if (this.isAdded) {
				Logger.log("Already added, skipping insertion");
				return;
			}

			if (this.observerDisconnected) {
				Logger.log("Observer disconnected, skipping insertion");
				return;
			}

			if (document.getElementById(CONFIG.customDivId)) {
				Logger.log("Custom div already exists in DOM, marking as added");
				this.isAdded = true;
				return;
			}

			if (this.retryCount > CONFIG.retryAttempts) {
				Logger.error("Max retry attempts reached");
				return;
			}

			this.retryCount++;
			Logger.log(`Attempting insertion (attempt ${this.retryCount})...`);
			this.addCustomDiv();
		},

		addCustomDiv: async function () {
			if (this.isAdded) return;

			Logger.log("Searching for #users-list-root container...");

			const container = await DOMUtils.waitForElement(CONFIG.containerSelector);

			if (!container) {
				Logger.warn("Container not found, will retry...");
				setTimeout(() => this.attemptInsertion(), CONFIG.retryDelay);
				return;
			}

			// Double-check if div already exists (could have been added by another instance)
			if (document.getElementById(CONFIG.customDivId)) {
				Logger.log("Custom div already exists, marking as added");
				this.isAdded = true;
				this.cleanup();
				return;
			}

			Logger.info(
				"Container found, creating custom div with filter options...",
			);

			if (this.createAndInsertDiv(container)) {
				this.isAdded = true;
				this.retryCount = 0;
				Logger.info("Custom div added successfully with filter options");

				this.cleanup();
			} else {
				Logger.error("Failed to create custom div, retrying...");
				setTimeout(() => this.attemptInsertion(), CONFIG.retryDelay);
			}
		},

		cleanup: function () {
			if (this.observer) {
				this.observer.disconnect();
				this.observer = null;
				this.observerDisconnected = true;
				Logger.log("Observer disconnected");
			}
		},

		createAndInsertDiv: function (container) {
			try {
				const existingDiv = document.getElementById(CONFIG.customDivId);
				if (existingDiv) {
					existingDiv.remove();
				}

				const customDiv = document.createElement("div");
				customDiv.id = CONFIG.customDivId;
				customDiv.className = "torn-friends-filter";

				const totalFriends =
					document.querySelectorAll(".tableRow___UgA6S").length || 0;

				customDiv.innerHTML = `
					<div style="
						background: linear-gradient(180deg, #535353 0%, #333333 100%);
						padding: 15px;
						border-radius: 6px;
						margin-bottom: 15px;
						color: #fff;
						font-family: Arial, sans-serif;
						box-shadow: 0 2px 4px rgba(0,0,0,0.2);
					">
						<div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center;">
							<!-- All Option -->
							<label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
								<input type="radio" name="friend-filter" value="all" checked style="cursor: pointer;">
								<span style="font-size: 13px;">All</span>
							</label>
							
							<!-- Online Option -->
							<label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
								<input type="radio" name="friend-filter" value="online" style="cursor: pointer;">
								<span class="marker-css" style="font-size: 13px; color: #82c91e;">Online</span>
							</label>
							
							<!-- Idle Option -->
							<label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
								<input type="radio" name="friend-filter" value="idle" style="cursor: pointer;">
								<span class="marker-css" style="font-size: 13px; color: #b55f00;">Idle</span>
							</label>
							
							<!-- Offline Option -->
							<label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
								<input type="radio" name="friend-filter" value="offline" style="cursor: pointer;">
								<span class="marker-css" style="font-size: 13px; color: #808080;">Offline</span>
							</label>
						</div>
					</div>
				`;

				if (container.children.length >= 3) {
					container.insertBefore(customDiv, container.children[3]);
					Logger.log("Inserted filter div as 4th child");
				} else {
					container.appendChild(customDiv);
					Logger.log("Container had no children, appended filter div");
				}

				this.customDiv = customDiv;

				const radios = customDiv.querySelectorAll(
					'input[name="friend-filter"]',
				);
				radios.forEach((radio) => {
					radio.addEventListener("change", (e) => {
						FilterManager.applyFilter(e.target.value);
					});
				});

				return true;
			} catch (error) {
				Logger.error(`Error creating filter div: ${error.message}`);
				return false;
			}
		},

		stop: function () {
			this.cleanup();
		},
	};

	// ========== INITIALIZATION ==========
	if (
		document.readyState === "complete" ||
		document.readyState === "interactive"
	) {
		setTimeout(() => CustomDivDisplay.init(), 1000);
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			setTimeout(() => CustomDivDisplay.init(), 1000);
		});
	}

	window.addEventListener("load", () => {
		setTimeout(() => CustomDivDisplay.init(), 500);
	});

	// ========== CLEANUP ==========
	window.addEventListener("beforeunload", function () {
		CustomDivDisplay.stop();
	});
})();
