// ==UserScript==
// @name         Torn Top Time
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Adds a simple time display at the top
// @author       Airfisher [4074952]
// @match        https://www.torn.com/*
// @grant        none
// @updateURL    https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-top-timer.user.js
// @downloadURL  https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-top-timer.user.js
// @supportURL   https://github.com/Airfisherr/torn-scripts/issues
// ==/UserScript==

(function () {
	"use strict";

	// ========== CONFIGURATION ==========
	const CONFIG = {
		debug: false,
		retryAttempts: 10,
		retryDelay: 1500,
		targetSelector: "#sidebar",
		updateInterval: 1000,
	};

	// ========== LOGGER ==========
	const Logger = {
		log: function (message) {
			if (CONFIG.debug) {
				console.log("[Torn Top Time]:", message);
			}
		},
		error: function (message) {
			console.error("[Torn Top Time ERROR]:", message);
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

		// check to see if time box already exists
		timeBoxExists: function () {
			return (
				document.querySelector("#torn-hours, #torn-minutes, #torn-seconds") !==
				null
			);
		},
	};

	// ========== TIME ELEMENT FINDER ==========
	const TimeElementFinder = {
		cachedElement: null,
		foundWithStrategy: null,

		findTimeElement: function (forceRefresh = false) {
			if (
				!forceRefresh &&
				this.cachedElement &&
				document.body.contains(this.cachedElement)
			) {
				return this.cachedElement;
			}

			const footerMenus = document.querySelectorAll(
				'[class*="footer-menu"], [class*="footerMenu"]',
			);
			for (const menu of footerMenus) {
				const timeElement = menu.querySelector(
					'[class*="date"], [class*="Date"]',
				);
				if (timeElement) {
					Logger.log("Found time element via footer menu class");
					this.cachedElement = timeElement;
					this.foundWithStrategy = "footer menu";
					return timeElement;
				}
			}

			this.cachedElement = null;
			this.foundWithStrategy = null;
			return null;
		},

		invalidateCache: function () {
			this.cachedElement = null;
			this.foundWithStrategy = null;
		},
	};

	// ========== TIME UTILITIES ==========
	const TimeUtils = {
		getTornTime: function () {
			const timeElement = TimeElementFinder.findTimeElement();

			if (!timeElement) {
				Logger.log("No time element found");
				return { hours: "00", minutes: "00", seconds: "00" };
			}

			const timeText = timeElement.textContent.trim();

			// Try different time patterns
			let timeMatch = timeText.match(/(\d{2}):(\d{2}):(\d{2})/);

			if (!timeMatch) {
				// Try pattern with day name
				timeMatch = timeText.match(/(?:[A-Za-z]{3}\s)?(\d{2}):(\d{2}):(\d{2})/);
			}

			if (timeMatch) {
				return {
					hours: timeMatch[1],
					minutes: timeMatch[2],
					seconds: timeMatch[3],
				};
			}

			Logger.log("Could not parse time from:", timeText);
			return { hours: "00", minutes: "00", seconds: "00" };
		},
	};

	// ========== SIDEBAR BOX ==========
	const SidebarBox = {
		isAdded: false,
		hoursElement: null,
		minutesElement: null,
		secondsElement: null,
		intervalId: null,
		refreshIntervalId: null,

		init: function () {
			Logger.log("Torn Top Time initializing...");

			// check to see if another instance already added the box
			if (DOMUtils.timeBoxExists()) {
				Logger.log("Time box already exists, skipping initialization");
				this.hoursElement = document.querySelector("#torn-hours");
				this.minutesElement = document.querySelector("#torn-minutes");
				this.secondsElement = document.querySelector("#torn-seconds");

				if (this.hoursElement && this.minutesElement && this.secondsElement) {
					this.isAdded = true;
					this.startTimeUpdates();

					// Still set up observer for cache refresh
					this.refreshIntervalId = setInterval(
						() => {
							TimeElementFinder.invalidateCache();
							Logger.log("Time element cache refreshed");
						},
						5 * 60 * 1000,
					);
				}
				return;
			}

			this.attemptInitialInsertion();
			this.setupObserver();
			// Periodically check if the time element cache needs refresh (every 5 minutes)
			this.refreshIntervalId = setInterval(
				() => {
					TimeElementFinder.invalidateCache();
					Logger.log("Time element cache refreshed");
				},
				5 * 60 * 1000,
			);
		},

		setupObserver: function () {
			const observer = new MutationObserver(() => {
				if (!this.isAdded && !DOMUtils.timeBoxExists() && this.shouldAddBox()) {
					this.addBox();
				}
				// If the page structure changes significantly, invalidate the time element cache
				if (this.isAdded) {
					TimeElementFinder.invalidateCache();
				}
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});
		},

		attemptInitialInsertion: function () {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => this.addBox());
			} else {
				this.addBox();
			}
		},

		shouldAddBox: function () {
			const sidebar = document.querySelector(CONFIG.targetSelector);
			return sidebar && DOMUtils.isElementVisible(sidebar);
		},

		addBox: async function () {
			if (this.isAdded || DOMUtils.timeBoxExists()) {
				Logger.log("Box already exists, skipping creation");
				return;
			}

			const sidebar = await DOMUtils.waitForElement(CONFIG.targetSelector);

			if (!sidebar) {
				setTimeout(() => this.addBox(), CONFIG.retryDelay);
				return;
			}

			if (DOMUtils.timeBoxExists()) {
				Logger.log("Box was added by another instance while waiting");
				return;
			}

			this.createAndInsertBox(sidebar);
			this.startTimeUpdates();
			this.isAdded = true;
			Logger.log("Box added successfully");
		},

		createAndInsertBox: function (sidebar) {
			const box = document.createElement("div");
			box.style.cssText = `
        margin-bottom: 4px;
        padding: 12px 15px;
        background: #333333;
        border-radius: 4px;
      `;

			box.innerHTML = `
        <div style="display: flex; align-items: baseline; justify-content: center;">
          <span id="torn-hours" style="
            font-family: 'Courier New', Courier, monospace;
            font-size: 20px;
            font-weight: bold;
            padding: 4px 0 4px 8px;
            border-radius: 4px;
            letter-spacing: 2px;
            display: inline-block;
            text-align: center;
          ">00</span>
          <span style="
            font-family: 'Courier New', Courier, monospace;
            font-size: 20px;
            font-weight: bold;
            padding: 4px 0;
            letter-spacing: 2px;
          ">:</span>
          <span id="torn-minutes" style="
            font-family: 'Courier New', Courier, monospace;
            font-size: 20px;
            font-weight: bold;
            padding: 4px 0;
            letter-spacing: 2px;
            display: inline-block;
            text-align: center;
          ">00</span>
          <span id="torn-seconds" style="
            font-family: 'Courier New', Courier, monospace;
            font-size: 14px;
            font-weight: bold;
            padding: 4px 0 0 6px;
            letter-spacing: 1px;
            display: inline-block;
            text-align: center;
            opacity: 0.9;
          ">00</span>
        </div>
      `;

			this.hoursElement = box.querySelector("#torn-hours");
			this.minutesElement = box.querySelector("#torn-minutes");
			this.secondsElement = box.querySelector("#torn-seconds");

			if (sidebar.firstChild) {
				sidebar.insertBefore(box, sidebar.firstChild);
			} else {
				sidebar.appendChild(box);
			}
		},

		updateTime: function () {
			if (this.hoursElement && this.minutesElement && this.secondsElement) {
				const time = TimeUtils.getTornTime();
				this.hoursElement.textContent = time.hours;
				this.minutesElement.textContent = time.minutes;
				this.secondsElement.textContent = time.seconds;
			}
		},

		startTimeUpdates: function () {
			this.updateTime();

			if (this.intervalId) {
				clearInterval(this.intervalId);
			}

			this.intervalId = setInterval(() => {
				this.updateTime();
			}, CONFIG.updateInterval);
		},

		stopTimeUpdates: function () {
			if (this.intervalId) {
				clearInterval(this.intervalId);
				this.intervalId = null;
			}
			if (this.refreshIntervalId) {
				clearInterval(this.refreshIntervalId);
				this.refreshIntervalId = null;
			}
		},
	};

	// ========== INITIALIZATION ==========
	SidebarBox.init();

	// ========== CLEANUP ==========
	window.addEventListener("beforeunload", function () {
		SidebarBox.stopTimeUpdates();
	});

	// ========== DEBUG ==========
	if (CONFIG.debug) {
		window.TornTopTime = {
			stop: () => SidebarBox.stopTimeUpdates(),
			start: () => SidebarBox.startTimeUpdates(),
			getTime: () => TimeUtils.getTornTime(),
			findTimeElement: (forceRefresh) =>
				TimeElementFinder.findTimeElement(forceRefresh),
			invalidateCache: () => TimeElementFinder.invalidateCache(),
		};
	}
})();
