// ==UserScript==
// @name         Torn Race Checker
// @namespace    http://tampermonkey.net/
// @version      1.8.1
// @description  Displays a race status in the sidebar, compatible with "Torn: Show Timers"
// @author       Airfisher [4074952]
// @match        https://www.torn.com/*
// @grant        none
// @updateURL    https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-race-checker.user.js
// @downloadURL  https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-race-checker.user.js
// @supportURL   https://github.com/Airfisherr/torn-scripts/issues
// ==/UserScript==

(function () {
	"use strict";

	// ========== CONFIGURATION ==========
	const CONFIG = {
		debug: false,
		retryAttempts: 30,
		retryDelay: 1000,
		updateInterval: 2000,
		primaryCheckInterval: 500,
		primaryWaitTimeout: 15000, // Wait up to 15 seconds for primary container
		fallbackCheckInterval: 500,
		fallbackWaitTimeout: 5000, // Wait up to 5 seconds for fallback
		raceIconSelectors: [
			"a[href='/page.php?sid=racing'][aria-label*='Racing:']",
			"a[href='/page.php?sid=racing']",
			"a[aria-label*='Racing:']",
			"a[aria-label*='racing']",
			".status-icons___gPkXF a[href*='racing']",
			"li.icon17___eXCy4 a",
			"a[href*='racing']",
		],
		containerSelectors: {
			primary: [
				"#sidebar > div:nth-child(2) > div > div.user-information___VBSOk > div > div.toggle-content___BJ9Q9 > div > div:nth-child(1) > div",
				"#sidebar .user-information___VBSOk .toggle-content___BJ9Q9 div.line-h24",
			],
			fallback: [
				"#sidebar > div:nth-child(2) > div > div.user-information___VBSOk > div > div.toggle-content___BJ9Q9 > div",
				"#sidebar .user-information___VBSOk .toggle-content___BJ9Q9 div.points___UO9AU",
			],
		},
		racingUrl: "https://www.torn.com/page.php?sid=racing",
	};

	// ========== LOGGER ==========
	const Logger = {
		log: function (message) {
			if (CONFIG.debug) {
				console.log(
					"[Torn Race Checker]:",
					message,
					new Date().toLocaleTimeString(),
				);
			}
		},
		error: function (message) {
			console.error(
				"[Torn Race Checker ERROR]:",
				message,
				new Date().toLocaleTimeString(),
			);
		},
		info: function (message) {
			if (CONFIG.debug) {
				console.info(
					"[Torn Race Checker]:",
					message,
					new Date().toLocaleTimeString(),
				);
			}
		},
		warn: function (message) {
			console.warn(
				"[Torn Race Checker WARNING]:",
				message,
				new Date().toLocaleTimeString(),
			);
		},
	};

	// ========== DOM UTILITIES ==========
	const DOMUtils = {
		waitForElement: function (
			selectors,
			maxAttempts = CONFIG.retryAttempts,
			interval = 500,
		) {
			return new Promise((resolve) => {
				let attempts = 0;
				const selectorList = Array.isArray(selectors) ? selectors : [selectors];

				const checkElement = () => {
					attempts++;

					for (const selector of selectorList) {
						const element = document.querySelector(selector);
						if (element && this.isElementVisible(element)) {
							Logger.log(`Found element with selector: ${selector}`);
							resolve(element);
							return;
						}
					}

					if (attempts >= maxAttempts) {
						Logger.log(`Element not found after ${maxAttempts} attempts`);
						resolve(null);
					} else {
						setTimeout(checkElement, interval);
					}
				};

				checkElement();
			});
		},

		isElementVisible: function (element) {
			if (!element) return false;

			const style = window.getComputedStyle(element);
			return (
				!!(
					element.offsetWidth ||
					element.offsetHeight ||
					element.getClientRects().length
				) &&
				style.display !== "none" &&
				style.visibility !== "hidden"
			);
		},

		// Specifically wait for primary container with class line-h24
		waitForPrimaryContainer: function () {
			return new Promise((resolve) => {
				const startTime = Date.now();
				let attempts = 0;

				const checkPrimary = () => {
					attempts++;

					// Try each primary selector
					for (const selector of CONFIG.containerSelectors.primary) {
						const element = document.querySelector(selector);
						if (
							element &&
							element.classList.contains("line-h24") &&
							this.isElementVisible(element)
						) {
							const elapsed = Date.now() - startTime;
							Logger.log(
								`Primary container found after ${attempts} attempts (${elapsed}ms)`,
							);
							resolve({ container: element, type: "primary", found: true });
							return;
						}
					}

					const elapsed = Date.now() - startTime;
					if (elapsed >= CONFIG.primaryWaitTimeout) {
						Logger.warn(
							`Primary container not found within ${CONFIG.primaryWaitTimeout}ms`,
						);
						resolve({ container: null, type: "primary", found: false });
						return;
					}

					setTimeout(checkPrimary, CONFIG.primaryCheckInterval);
				};

				checkPrimary();
			});
		},

		// Wait for fallback container only after primary fails
		waitForFallbackContainer: function () {
			return new Promise((resolve) => {
				const startTime = Date.now();
				let attempts = 0;

				const checkFallback = () => {
					attempts++;

					// Try each fallback selector
					for (const selector of CONFIG.containerSelectors.fallback) {
						const element = document.querySelector(selector);
						if (
							element &&
							element.classList.contains("points___UO9AU") &&
							this.isElementVisible(element)
						) {
							const elapsed = Date.now() - startTime;
							Logger.log(
								`Fallback container found after ${attempts} attempts (${elapsed}ms)`,
							);
							resolve({ container: element, type: "fallback", found: true });
							return;
						}
					}

					const elapsed = Date.now() - startTime;
					if (elapsed >= CONFIG.fallbackWaitTimeout) {
						Logger.warn(
							`Fallback container not found within ${CONFIG.fallbackWaitTimeout}ms`,
						);
						resolve({ container: null, type: "fallback", found: false });
						return;
					}

					setTimeout(checkFallback, CONFIG.fallbackCheckInterval);
				};

				checkFallback();
			});
		},

		// New method that properly prioritizes primary container
		findBestAvailableContainer: async function () {
			Logger.info(
				"Attempting to find primary container first (will wait up to 15 seconds)...",
			);

			// Step 1: Wait for primary container
			const primaryResult = await this.waitForPrimaryContainer();

			if (primaryResult.found) {
				Logger.info("Using primary container (line-h24)");
				return primaryResult;
			}

			Logger.warn(
				"Primary container not found, attempting fallback container...",
			);

			// Step 2: Only try fallback if primary fails
			const fallbackResult = await this.waitForFallbackContainer();

			if (fallbackResult.found) {
				Logger.info("Using fallback container (points___UO9AU)");
				return fallbackResult;
			}

			// Step 3: Neither container found
			Logger.error("Neither primary nor fallback container found");
			return { container: null, type: null, found: false };
		},
	};

	// ========== RACE UTILITIES ==========
	const RaceUtils = {
		lastStatus: "",

		getRaceStatus: function () {
			let raceIcon = null;

			for (const selector of CONFIG.raceIconSelectors) {
				raceIcon = document.querySelector(selector);
				if (raceIcon) {
					Logger.log(`Found race icon with selector: ${selector}`);
					break;
				}
			}

			if (!raceIcon) {
				const allLinks = document.querySelectorAll("a");
				for (const link of allLinks) {
					if (link.href && link.href.includes("racing")) {
						raceIcon = link;
						Logger.log("Found race icon through href search");
						break;
					}
				}
			}

			if (!raceIcon) {
				Logger.error("Race icon not found");
				return "Not available";
			}

			let status =
				raceIcon.getAttribute("aria-label") ||
				raceIcon.getAttribute("title") ||
				raceIcon.textContent;

			if (!status) {
				return "Unknown";
			}

			status = status.toLowerCase();

			if (status.includes("finished") || status.includes("ready")) {
				return "Ready!";
			}
			if (status.includes("waiting")) {
				return "Waiting";
			}
			if (status.includes("racing")) {
				return "In Race";
			}

			return raceIcon.getAttribute("aria-label") || "Unknown";
		},

		hasStatusChanged: function () {
			const currentStatus = this.getRaceStatus();
			const changed = currentStatus !== this.lastStatus;
			if (changed) {
				Logger.log(
					`Status changed from "${this.lastStatus}" to "${currentStatus}"`,
				);
				this.lastStatus = currentStatus;
			}
			return changed;
		},
	};

	// ========== RACE DISPLAY ==========
	const RaceDisplay = {
		isAdded: false,
		displayElement: null,
		statusContainer: null,
		intervalId: null,
		observer: null,
		currentContainerType: null,
		retryCount: 0,
		currentStatus: "",

		init: function () {
			Logger.info("Torn Race Checker initializing...");
			// Give the page a moment to load, then start looking
			setTimeout(() => this.attemptInitialInsertion(), 2000);
			this.setupObserver();
		},

		setupObserver: function () {
			let debounceTimer;

			this.observer = new MutationObserver(() => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					if (!this.isAdded) {
						// Only attempt insertion if we haven't added yet
						this.attemptInitialInsertion();
					} else if (RaceUtils.hasStatusChanged()) {
						this.updateDisplay();
					}
				}, 500);
			});

			// Observe the sidebar specifically if possible, otherwise whole body
			const sidebar = document.querySelector("#sidebar");
			const targetNode = sidebar || document.body;

			this.observer.observe(targetNode, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["aria-label", "class", "style"],
			});

			Logger.log("Observer attached to " + (sidebar ? "sidebar" : "body"));
		},

		attemptInitialInsertion: function () {
			if (this.isAdded) return;
			if (this.retryCount > 15) {
				// Increased max retries
				Logger.error("Max retry attempts reached");
				return;
			}

			this.retryCount++;
			Logger.log(`Attempting insertion (attempt ${this.retryCount})...`);
			this.addDisplay();
		},

		addDisplay: async function () {
			if (this.isAdded) return;

			Logger.log(
				"Searching for best available container (primary preferred)...",
			);

			// Use the new prioritized container finder
			const { container, type, found } =
				await DOMUtils.findBestAvailableContainer();

			if (!found || !container) {
				Logger.warn("No container found on this attempt, will retry...");
				setTimeout(() => this.attemptInitialInsertion(), CONFIG.retryDelay);
				return;
			}

			this.currentContainerType = type;
			Logger.info(`Container found (type: ${type}), creating display...`);

			if (this.createAndInsertDisplay(container)) {
				this.startUpdates();
				this.isAdded = true;
				this.retryCount = 0;
				Logger.info(`Display added successfully to ${type} container`);
			} else {
				Logger.error("Failed to create display, retrying...");
				setTimeout(() => this.attemptInitialInsertion(), CONFIG.retryDelay);
			}
		},

		handleStatusClick: function (event) {
			// Only navigate if the status is "Ready!"
			if (this.currentStatus === "Ready!") {
				Logger.log("Navigating to racing page from click");
				window.location.href = CONFIG.racingUrl;
			} else {
				// If not ready, prevent default action
				event.preventDefault();
				event.stopPropagation();
				Logger.log("Click ignored - race not ready");
			}
		},

		createAndInsertDisplay: function (container) {
			try {
				const existingDisplay = container.querySelector(".torn-race-display");
				if (existingDisplay) {
					existingDisplay.remove();
				}

				const raceElement = document.createElement("div");
				raceElement.className = "torn-race-display";

				if (this.currentContainerType === "primary") {
					// For line-h24 container - make it look like the other timer paragraphs
					raceElement.style.cssText = `
						font-size: .8rem;
						font-weight: 400;
						line-height: 24px;
						display: block;
						margin: 0;
						padding: 0;
					`;

					raceElement.innerHTML = `
						<p style="margin: 0; display: flex; align-items: center;">
							<b style="width: 60px; font-weight: bold;">Racing:</b>
							<span id="race-status-text" style="cursor: pointer; transition: opacity 0.2s;" title="Race not ready">Loading...</span>
						</p>
					`;

					this.statusContainer = raceElement.querySelector("#race-status-text");
				} else {
					// For points container - make it look like the point blocks
					raceElement.style.cssText = `
						font-size: 12px;
						font-family: Arial, sans-serif;
						display: flex;
						align-items: center;
						padding: 2px 0;
					`;

					raceElement.innerHTML = `
						<p class="point-block___rQyUK" style="margin: 0; display: flex; align-items: center; width: 100%; cursor: pointer;" tabindex="0">
							<span class="name___ChDL3" style="min-width: 45px;">Racing:</span>
							<span id="race-status-text" class="value___mHNGb" style="transition: opacity 0.2s;" title="Race not ready">Loading...</span>
						</p>
					`;

					this.statusContainer = raceElement.querySelector("p");
				}

				this.displayElement = raceElement.querySelector("#race-status-text");

				// Add click handlers based on container type
				if (this.currentContainerType === "primary") {
					this.displayElement.addEventListener("click", (event) =>
						this.handleStatusClick(event),
					);

					this.displayElement.addEventListener("mouseenter", () => {
						if (this.currentStatus === "Ready!") {
							this.displayElement.style.opacity = "0.8";
							this.displayElement.style.textDecoration = "underline";
						}
					});

					this.displayElement.addEventListener("mouseleave", () => {
						this.displayElement.style.opacity = "1";
						this.displayElement.style.textDecoration = "none";
					});
				} else {
					const clickableElement = raceElement.querySelector("p");
					clickableElement.addEventListener("click", (event) =>
						this.handleStatusClick(event),
					);

					clickableElement.addEventListener("mouseenter", () => {
						if (this.currentStatus === "Ready!") {
							clickableElement.style.backgroundColor =
								"rgba(130, 201, 30, 0.1)";
							this.displayElement.style.textDecoration = "underline";
						}
					});

					clickableElement.addEventListener("mouseleave", () => {
						clickableElement.style.backgroundColor = "";
						this.displayElement.style.textDecoration = "none";
					});
				}

				// Insert at the correct position
				if (this.currentContainerType === "primary") {
					const hr = container.querySelector("hr");
					if (hr) {
						container.insertBefore(raceElement, hr);
						Logger.log("Inserted race display before HR in primary container");
					} else {
						container.appendChild(raceElement);
						Logger.log(
							"Appended race display to primary container (no HR found)",
						);
					}
				} else {
					container.appendChild(raceElement);
					Logger.log("Appended race display to fallback container");
				}

				this.updateDisplay();
				return true;
			} catch (error) {
				Logger.error(`Error creating display: ${error.message}`);
				return false;
			}
		},

		updateDisplay: function () {
			if (this.displayElement) {
				const raceStatus = RaceUtils.getRaceStatus();
				this.currentStatus = raceStatus;

				if (this.displayElement.textContent !== raceStatus) {
					this.displayElement.textContent = raceStatus;

					const titleText =
						raceStatus === "Ready!"
							? "Click to go to Racing"
							: "Race not ready";

					if (this.currentContainerType === "primary") {
						this.displayElement.title = titleText;
					} else {
						const parent = this.displayElement.closest("p");
						if (parent) parent.title = titleText;
					}

					const statusLower = raceStatus.toLowerCase();
					if (statusLower.includes("ready")) {
						this.displayElement.style.color = "#82c91e";
						this.displayElement.style.fontWeight = "bold";
						if (this.currentContainerType === "primary") {
							this.displayElement.style.cursor = "pointer";
						}
					} else if (statusLower.includes("waiting")) {
						this.displayElement.style.color = "#bfb22f";
						this.displayElement.style.fontWeight = "normal";
						this.displayElement.style.cursor = "default";
					} else if (
						statusLower.includes("in race") ||
						statusLower.includes("racing")
					) {
						this.displayElement.style.color = "#b63e2d";
						this.displayElement.style.fontWeight = "normal";
						this.displayElement.style.cursor = "default";
					} else {
						this.displayElement.style.color = "";
						this.displayElement.style.fontWeight = "normal";
						this.displayElement.style.cursor = "default";
					}

					Logger.log(
						`Updated race status: "${raceStatus}" (clickable: ${raceStatus === "Ready!"})`,
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
				if (this.isAdded && RaceUtils.hasStatusChanged()) {
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
		},
	};

	// ========== INITIALIZATION ==========
	// More robust initialization with longer delays
	if (
		document.readyState === "complete" ||
		document.readyState === "interactive"
	) {
		setTimeout(() => RaceDisplay.init(), 2000);
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			setTimeout(() => RaceDisplay.init(), 2000);
		});
	}

	window.addEventListener("load", () => {
		setTimeout(() => RaceDisplay.init(), 1000);
	});

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
			findBestContainer: () => DOMUtils.findBestAvailableContainer(),
			testSelectors: () => {
				console.group("Selector Testing");
				console.log("Race Icon Selectors:");
				CONFIG.raceIconSelectors.forEach((sel) => {
					console.log(`${sel}: ${document.querySelector(sel) ? "✓" : "✗"}`);
				});
				console.log("\nPrimary Container Selectors (line-h24):");
				CONFIG.containerSelectors.primary.forEach((sel) => {
					const el = document.querySelector(sel);
					console.log(
						`${sel}: ${el ? "✓" : "✗"} ${el ? `(class: ${el.className})` : ""}`,
					);
				});
				console.log("\nFallback Container Selectors (points___UO9AU):");
				CONFIG.containerSelectors.fallback.forEach((sel) => {
					const el = document.querySelector(sel);
					console.log(
						`${sel}: ${el ? "✓" : "✗"} ${el ? `(class: ${el.className})` : ""}`,
					);
				});
				console.groupEnd();
			},
			enableDebug: () => {
				CONFIG.debug = true;
				Logger.info("Debug mode enabled");
			},
			disableDebug: () => {
				CONFIG.debug = false;
			},
		};
		console.log(
			"Torn Race Checker: Debug commands available via window.TornRaceChecker",
		);
	}
})();
