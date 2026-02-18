// ==UserScript==
// @name         Torn Top Time
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Displays Torn's sidebar time at the top
// @author       Airfisher [4074952]
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ========== CONFIGURATION ==========
  const CONFIG = {
    debug: true,
    retryAttempts: 10,
    retryDelay: 1500,
    targetSelector: "#sidebar",
    timeSourceSelector: "#sidebar > div:nth-child(5) > div > div.footer-menu___sjBQ2.left___YEDk7 > div.date___UsClD",
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
    waitForElement: function (selector, maxAttempts = CONFIG.retryAttempts, interval = 500) {
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
  };

  // ========== TIME UTILITIES ==========
  const TimeUtils = {
    getTornTime: function () {
      const timeElement = document.querySelector(CONFIG.timeSourceSelector);

      if (!timeElement) {
        return { hours: "00", minutes: "00", seconds: "00" };
      }

      const timeSpan = timeElement.querySelector("span:first-child");
      if (!timeSpan) {
        return { hours: "00", minutes: "00", seconds: "00" };
      }

      const timeText = timeSpan.textContent.trim();

      // Extract HH:MM:SS from format like "Thu 22:57:34"
      const timeMatch = timeText.match(/(\d{2}):(\d{2}):(\d{2})/);

      if (timeMatch) {
        return {
          hours: timeMatch[1],
          minutes: timeMatch[2],
          seconds: timeMatch[3],
        };
      }

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

    init: function () {
      Logger.log("Torn Top Time initializing...");
      this.attemptInitialInsertion();
      this.setupObserver();
    },

    setupObserver: function () {
      const observer = new MutationObserver(() => {
        if (!this.isAdded && this.shouldAddBox()) {
          this.addBox();
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
      if (this.isAdded) {
        Logger.log("Box already exists");
        return;
      }

      const sidebar = await DOMUtils.waitForElement(CONFIG.targetSelector);

      if (!sidebar) {
        Logger.log("Sidebar not found, retrying...");
        setTimeout(() => this.addBox(), CONFIG.retryDelay);
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
      sourceElement: () => document.querySelector(CONFIG.timeSourceSelector),
    };
  }
})();
