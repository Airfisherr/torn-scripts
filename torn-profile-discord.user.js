// ==UserScript==
// @name         Torn Profile Discord
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Displays on the profile if the user has a discord linked or not.
// @author       Airfisher [4074952]
// @match        https://www.torn.com/profiles.php*
// @grant        none
// @updateURL    https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-profile-discord.user.js
// @downloadURL  https://github.com/Airfisherr/torn-scripts/raw/refs/heads/main/torn-profile-discord.user.js
// @supportURL   https://github.com/Airfisherr/torn-scripts/issues
// ==/UserScript==

(function () {
	"use strict";

	// ========== CONFIGURATION ==========
	const CONFIG = {
		debug: true,
		buttonId: "custom-profile-button",
		buttonLabel: "Custom",
		buttonUrl: "#",
		targetSelector:
			"#profileroot > div > div > div > div:nth-child(2) > div.profile-right-wrapper.right > div.profile-buttons.profile-action > div > div.cont.bottom-round > div > div > div > div",
		discordToken: "",
	};

	// ========== LOGGER ==========
	const Logger = {
		log: function (message) {
			if (CONFIG.debug) {
				console.log("[Torn Custom Button]:", message);
			}
		},
		error: function (message) {
			console.error("[Torn Custom Button ERROR]:", message);
		},
	};

	// ========== BUTTON CREATION ==========
	const CustomButton = {
		isAdded: false,

		init: function () {
			Logger.log("Initializing...");

			if (this.shouldAddButton()) {
				this.addButton();
			}

			this.setupObserver();
		},

		setupObserver: function () {
			const observer = new MutationObserver(() => {
				if (!this.isAdded && this.shouldAddButton()) {
					this.addButton();
				}
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});
		},

		shouldAddButton: function () {
			if (!window.location.pathname.includes("/profiles.php")) {
				return false;
			}

			const buttonContainer = document.querySelector(CONFIG.targetSelector);
			return buttonContainer && !document.getElementById(CONFIG.buttonId);
		},

		addButton: function () {
			const buttonContainer = document.querySelector(CONFIG.targetSelector);

			if (!buttonContainer) {
				Logger.log("Button container not found");
				return;
			}

			if (document.getElementById(CONFIG.buttonId)) {
				Logger.log("Button already exists");
				return;
			}

			this.createButton(buttonContainer);
			this.isAdded = true;
			Logger.log("Button added successfully");
		},

		createButton: function (container) {
			const urlParams = new URLSearchParams(window.location.search);
			const userId = urlParams.get("XID");

			const button = document.createElement("a");
			button.id = CONFIG.buttonId;
			button.href = CONFIG.buttonUrl.replace("{userId}", userId || "");
			button.className = "profile-button active";
			button.style =
				"display: flex; align-items: center; justify-content: center; ";
			button.setAttribute("aria-label", "Discord");
			button.setAttribute("data-is-tooltip-opened", "false");
			button.style.touchAction = "manipulation";

			button.innerHTML = `
		<style>
			#${CONFIG.buttonId} svg path {
				fill: #5865F2 !important;
				transition: fill 0.2s ease;
			}
			#${CONFIG.buttonId}:hover svg path {
				fill: #5865F2 !important;
			}
		</style>
		<svg style="width: 30px; height: 30px;" viewBox="-50 -70 350 350" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid">
			<path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill-rule="nonzero" fill="#d4d4d4"/>
		</svg>
	`;

			button.addEventListener("mouseenter", () => {
				button.setAttribute("data-is-tooltip-opened", "true");
			});

			button.addEventListener("mouseleave", () => {
				button.setAttribute("data-is-tooltip-opened", "false");
			});

			button.addEventListener("click", async (e) => {
				e.preventDefault();

				try {
					const url = `https://discord.com/api/users/${userId}`;
					const response = await fetch(url, {
						headers: {
							Authorization: `${CONFIG.discordToken}`,
						},
					});

					if (!response.ok) {
						throw new Error(`Error fetching user data: ${response.statusText}`);
					}

					const data = await response.json();
					Logger.log(data); // full user object
					Logger.log(data.username); // username only
				} catch (error) {
					Logger.error(error);
				}
			});

			container.appendChild(button);
		},
	};

	// ========== INITIALIZATION ==========
	// Start when DOM is ready
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => CustomButton.init());
	} else {
		CustomButton.init();
	}
})();
