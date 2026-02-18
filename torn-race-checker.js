// ==UserScript==
// @name         Torn Race Checker
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Displays a race status in the sidebar, compatible with "Torn: Show Timers"
// @author       Airfisher [4074952]
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	// ========== CONFIGURATION ==========
	const CONFIG = {
		debug: false,
		ApiKey: null,
		retryAttempts: 20,
		retryDelay: 1500,
		updateInterval: 2000,
		primaryCheckInterval: 500,
		primaryCheckTimeout: 5000,
		raceIconSelector: "a[href='/page.php?sid=racing'][aria-label*='Racing:']",
		primaryContainerSelector:
			"#sidebar > div:nth-child(2) > div > div.user-information___VBSOk > div > div.toggle-content___BJ9Q9 > div > div:nth-child(1) > div",
		fallbackContainerSelector:
			"#sidebar > div:nth-child(2) > div > div.user-information___VBSOk > div > div.toggle-content___BJ9Q9 > div",
	};

	// ========== LOGGER ==========
	const Logger = {
		log: function (message) {
			if (CONFIG.debug) {
				console.log("[Torn Race Checker]:", message);
			}
		},
		error: function (message) {
			console.error("[Torn Race Checker ERROR]:", message);
		},
	};

	// ========== DOM UTILITIES ==========
	const DOMUtils = {
		waitForElement: function (
			selector,
			maxAttempts = CONFIG.retryAttempts,
			interval = 500,
		) {
			return new Promise((resolve) => {
				let attempts = 0;

				const checkElement = () => {
					attempts++;
					const element = document.querySelector(selector);

					if (element) {
						resolve(element);
					} else if (attempts >= maxAttempts) {
						resolve(null);
					} else {
						setTimeout(checkElement, interval);
					}
				};

				checkElement();
			});
		},

		isElementVisible: function (element) {
			return element && element.offsetParent !== null;
		},

		waitForPrimaryContainer: function () {
			return new Promise((resolve) => {
				const startTime = Date.now();
				let attempts = 0;

				const checkPrimary = () => {
					attempts++;
					const primaryContainer = document.querySelector(
						CONFIG.primaryContainerSelector,
					);

					if (primaryContainer && this.isElementVisible(primaryContainer)) {
						Logger.log(
							`Primary container found after ${attempts} attempts (${Date.now() - startTime}ms)`,
						);
						resolve({ container: primaryContainer, type: "primary" });
						return;
					}

					const elapsed = Date.now() - startTime;
					if (elapsed >= CONFIG.primaryCheckTimeout) {
						Logger.log(
							`Primary container not found within ${CONFIG.primaryCheckTimeout}ms, using fallback`,
						);
						const fallbackContainer = document.querySelector(
							CONFIG.fallbackContainerSelector,
						);
						if (fallbackContainer && this.isElementVisible(fallbackContainer)) {
							resolve({ container: fallbackContainer, type: "fallback" });
						} else {
							resolve({ container: null, type: null });
						}
						return;
					}

					setTimeout(checkPrimary, CONFIG.primaryCheckInterval);
				};

				checkPrimary();
			});
		},

		getTargetContainer: async function () {
			const result = await this.waitForPrimaryContainer();
			return result;
		},
	};

	// ========== RACE UTILITIES ==========
	const RaceUtils = {
		lastStatus: "",

		getRaceStatus: function () {
			let raceIcon = document.querySelector(CONFIG.raceIconSelector);

			if (!raceIcon) {
				const fallbackSelectors = [
					"a[href='/page.php?sid=racing']",
					"a[aria-label*='Racing:']",
					".status-icons___gPkXF a[href*='racing']",
					"li.icon17___eXCy4 a",
				];

				for (const selector of fallbackSelectors) {
					raceIcon = document.querySelector(selector);
					if (raceIcon) {
						Logger.log(`Found race icon with fallback selector: ${selector}`);
						break;
					}
				}
			}

			if (!raceIcon) {
				Logger.error("Race icon not found with any selector");
				return "Not available?";
			}

			const ariaLabel = raceIcon.getAttribute("aria-label");

			if (!ariaLabel) {
				Logger.error("No aria-label found on race icon");
				return "Unknown?";
			}
			if (ariaLabel?.toLowerCase().includes("finished")) {
				return "Ready!";
			}
			if (ariaLabel?.toLowerCase().includes("waiting")) {
				return "Waiting";
			}
			if (ariaLabel?.toLowerCase().includes("racing")) {
				return "In Race";
			}

			return ariaLabel;
		},

		hasStatusChanged: function () {
			const currentStatus = this.getRaceStatus();
			const changed = currentStatus !== this.lastStatus;
			if (changed) {
				this.lastStatus = currentStatus;
			}
			return changed;
		},
	};

	// ========== RACE DISPLAY ==========
	const RaceDisplay = {
		isAdded: false,
		displayElement: null,
		intervalId: null,
		observer: null,
		updateTimeout: null,
		currentContainerType: null,

		init: function () {
			Logger.log("Torn Race Checker initializing...");
			this.attemptInitialInsertion();
			this.setupObserver();
		},

		setupObserver: function () {
			let debounceTimer;

			this.observer = new MutationObserver(() => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					if (!this.isAdded && this.shouldAddDisplay()) {
						this.addDisplay();
					} else if (this.isAdded && RaceUtils.hasStatusChanged()) {
						this.updateDisplay();
					}
				}, 500);
			});

			const sidebar = document.querySelector("#sidebar");
			if (sidebar) {
				this.observer.observe(sidebar, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["aria-label"],
				});
			} else {
				this.observer.observe(document.body, {
					childList: true,
					subtree: true,
				});
			}
		},

		attemptInitialInsertion: function () {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => this.addDisplay());
			} else {
				this.addDisplay();
			}
		},

		shouldAddDisplay: function () {
			const { container } = DOMUtils.getTargetContainer();
			return container && DOMUtils.isElementVisible(container);
		},

		addDisplay: async function () {
			if (this.isAdded) {
				return;
			}

			Logger.log(
				"Checking for primary container (will wait up to 5 seconds)...",
			);
			const { container, type } = await DOMUtils.getTargetContainer();

			if (!container) {
				Logger.error("No container found after waiting, will retry later");
				setTimeout(() => this.addDisplay(), CONFIG.retryDelay);
				return;
			}

			this.currentContainerType = type;
			this.createAndInsertDisplay(container);
			this.startUpdates();
			this.isAdded = true;
			Logger.log(`Display added successfully to ${type} container`);
		},

		createAndInsertDisplay: function (container) {
			const existingDisplay = container.querySelector(".torn-race-display");
			if (existingDisplay) {
				existingDisplay.remove();
			}

			const raceElement = document.createElement("div");
			raceElement.className = "torn-race-display";

			if (this.currentContainerType === "primary") {
				raceElement.style.cssText = `
      font-size: 12.8px;
      font-family: Arial, sans-serif;
      display: flex;
      align-items: center;
    `;
			} else {
				raceElement.style.cssText = `
      margin-bottom: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      display: flex;
      align-items: center;
    `;
			}

			raceElement.innerHTML = `
    <a href="https://www.torn.com/page.php?sid=racing" style="
      flex: 1;
      text-decoration: none;
      color: inherit;
      display: flex;
      align-items: center;
      cursor: pointer;
    ">
      <span style="font-weight: bold; margin-right: 5px;">Racing: </span>
      <span id="race-status-text" style="margin-left: 2px;">Loading...</span>
    </a>
  `;

			this.displayElement = raceElement.querySelector("#race-status-text");
			this.linkElement = raceElement.querySelector("a");

			const elementChildren = Array.from(container.children).filter(
				(child) => child.nodeType === Node.ELEMENT_NODE,
			);

			if (elementChildren.length >= 2) {
				const lastElement = elementChildren[elementChildren.length - 1];
				container.insertBefore(raceElement, lastElement);
			} else {
				container.appendChild(raceElement);
			}

			this.updateDisplay();
		},

		updateDisplay: function () {
			if (this.displayElement && this.linkElement) {
				const raceStatus = RaceUtils.getRaceStatus();
				if (this.displayElement.textContent !== raceStatus) {
					this.displayElement.textContent = raceStatus;

					if (raceStatus.toLowerCase().includes("ready")) {
						this.displayElement.style.color = "#82c91e";
					} else if (raceStatus.toLowerCase().includes("waiting")) {
						this.displayElement.style.color = "#bfb22f";
					} else if (raceStatus.toLowerCase().includes("in race")) {
						this.displayElement.style.color = "#b63e2d";
					} else {
						this.displayElement.style.color = "rebeccapurple";
					}

					Logger.log(
						`Updated race status: "${raceStatus}" with color: ${this.displayElement.style.color}`,
					);
				}
			}
		},

		startUpdates: function () {
			this.updateDisplay();

			if (this.intervalId) {
				clearInterval(this.intervalId);
			}

			this.intervalId = setInterval(() => {
				if (RaceUtils.hasStatusChanged()) {
					this.updateDisplay();
				}
			}, CONFIG.updateInterval);
		},

		stopUpdates: function () {
			if (this.intervalId) {
				clearInterval(this.intervalId);
				this.intervalId = null;
			}
			if (this.observer) {
				this.observer.disconnect();
				this.observer = null;
			}
			if (this.updateTimeout) {
				clearTimeout(this.updateTimeout);
				this.updateTimeout = null;
			}
		},
	};

	// ========== INITIALIZATION ==========
	if (document.readyState === "complete") {
		RaceDisplay.init();
	} else {
		window.addEventListener("load", () => RaceDisplay.init());
	}

	// ========== CLEANUP ==========
	window.addEventListener("beforeunload", function () {
		RaceDisplay.stopUpdates();
	});

	// ========== DEBUG ==========
	if (window.location.search.includes("race_debug=true") || CONFIG.debug) {
		window.TornRaceChecker = {
			stop: () => RaceDisplay.stopUpdates(),
			start: () => RaceDisplay.init(),
			getRaceStatus: () => RaceUtils.getRaceStatus(),
			forceUpdate: () => RaceDisplay.updateDisplay(),
			enableDebug: () => {
				CONFIG.debug = true;
			},
			disableDebug: () => {
				CONFIG.debug = false;
			},
			elements: {
				raceIcon: () => document.querySelector(CONFIG.raceIconSelector),
				primaryContainer: () =>
					document.querySelector(CONFIG.primaryContainerSelector),
				fallbackContainer: () =>
					document.querySelector(CONFIG.fallbackContainerSelector),
			},
		};
		console.log(
			"Torn Race Checker: Debug commands available via window.TornRaceChecker",
		);
	}
})();
