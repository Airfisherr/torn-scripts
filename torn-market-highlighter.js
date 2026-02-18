// ==UserScript==
// @name         Torn Market Helper
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Add market helper section to Torn.com Item Market with persistent storage and price highlighting
// @author       Airfisher [4074952]
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ========== MAIN CONFIGURATION ==========
  const CONFIG = {
    debug: true,
    retryAttempts: 10,
    retryDelay: 1500,
    observerDelay: 1000,
    storageKey: "torn_market_helper_values",
    listingsPollInterval: 3000,

    // Auto-detected values
    currentUsername: null,
    currentUserId: null,

    // DOM Selectors
    targetSelector:
      "#item-market-root > div.item-market > div > div.marketWrapper___S5pRm:nth-of-type(2) > div.categoriesWrapper___MaSH4:nth-of-type(1) > div.categoryGroups___qYbKb:nth-of-type(2)",

    // HTML Templates
    equipmentHTML: `
            <div class="categoryGroup___pSOav market-helper-section">
                <div class="title___yFW_k">MARKET HELPER</div>
                <div class="categoryTabsWrapper___MXflk">
                    <div class="input-container">
                        <input id="market-helper-input" class="searchInput___bwRsu" 
                               placeholder="Enter Value" autocomplete="off" 
                               type="text" value="">
                    </div>
                    <button class="categoryTab___ZPXgK categoryTab___O8kzw set-value-btn" 
                            role="tab" type="button" aria-selected="false" 
                            tabindex="-1">
                        <i class="enhancer___jRSi3"></i>
                        <span class="title___tvSd2">Set Value</span>
                    </button>
                    <button class="categoryTab___ZPXgK categoryTab___O8kzw clear-value-btn" 
                            role="tab" type="button" aria-selected="false" 
                            tabindex="-1">
                        <i class="enhancer___jRSi3"></i>
                        <span class="title___tvSd2">Clear</span>
                    </button>
                </div>
            </div>
        `,
  };

  // ========== STYLES ==========
  const STYLES = `
        .market-helper-section {
            position: relative;
        }
        
        .market-helper-section .input-container {
            padding: 10px;
        }
        
        .market-helper-section .searchInput___bwRsu {
            height: 32px;
            width: 100%;
            box-sizing: border-box;
        }
        
        .saved-value-indicator {
            margin-left: 5px;
            font-size: 12px;
            color: #666;
            font-style: italic;
        }
        
        .listings-count {
            margin-left: 5px;
            font-size: 12px;
            color: #666;
            font-style: italic;
        }
        
        /* Highlighting styles */
        .listing-good-deal {
            background-color: rgba(144, 238, 144, 0.3) !important;
            border-left: 3px solid #28a745 !important;
        }
        
        .listing-great-deal {
            background-color: rgba(50, 205, 50, 0.4) !important;
            border-left: 3px solid #20c997 !important;
        }
        
        .listing-excellent-deal {
            background-color: rgba(0, 128, 0, 0.5) !important;
            border-left: 3px solid #198754 !important;
            color: white !important;
        }
        
        /* Own listing styles */
        .listing-own-listing {
            background-color: rgba(147, 112, 219, 0.3) !important;
            border-left: 3px solid #8a2be2 !important;
        }
        
        .listing-own-good-deal {
            background-color: rgba(186, 85, 211, 0.4) !important;
            border-left: 3px solid #9400d3 !important;
        }
        
        .listing-own-excellent-deal {
            background-color: rgba(128, 0, 128, 0.5) !important;
            border-left: 3px solid #800080 !important;
            color: white !important;
        }
        
        /* Price styling */
        .listing-good-deal .price___Uwiv2,
        .listing-great-deal .price___Uwiv2,
        .listing-excellent-deal .price___Uwiv2 {
            font-weight: bold;
            color: #198754 !important;
        }
        
        .listing-own-listing .price___Uwiv2,
        .listing-own-good-deal .price___Uwiv2,
        .listing-own-excellent-deal .price___Uwiv2 {
            font-weight: bold;
            color: #8a2be2 !important;
        }
        
        /* Deal indicators */
        .deal-indicator {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
            z-index: 1;
        }
        
        .good-deal-indicator {
            background-color: #28a745;
            color: white;
        }
        
        .great-deal-indicator {
            background-color: #20c997;
            color: white;
        }
        
        .excellent-deal-indicator {
            background-color: #198754;
            color: white;
        }
        
        .own-listing-indicator {
            background-color: #8a2be2;
            color: white;
        }
        
        .own-good-deal-indicator {
            background-color: #9400d3;
            color: white;
        }
        
        .own-excellent-deal-indicator {
            background-color: #800080;
            color: white;
        }
        
        /* Z-index management */
        .categoryTab___ZPXgK {
            position: relative;
            z-index: 1;
        }
        
        div[class*="dropdown"],
        div[class*="menu"],
        div[class*="popup"],
        div[class*="tooltip"] {
            z-index: 1000 !important;
        }
        
        .menu___,
        .dropdown___,
        .popup___,
        .tooltip___ {
            z-index: 1000 !important;
        }
    `;

  // ========== LOGGER ==========
  class Logger {
    static log(message) {
      if (CONFIG.debug) {
        console.log("[Market Helper]:", message);
      }
    }

    static error(message) {
      console.error("[Market Helper ERROR]:", message);
    }
  }

  // ========== USER DETECTION ==========
  class UserDetector {
    static detect() {
      const scripts = document.querySelectorAll("script[server_name]");
      for (const script of scripts) {
        const playerName = script.getAttribute("playername");
        const playerId = script.getAttribute("playerid");

        if (playerName && playerId) {
          CONFIG.currentUsername = playerName;
          CONFIG.currentUserId = playerId;
          Logger.log(`Detected user: ${playerName} (ID: ${playerId})`);
          return { username: playerName, userId: playerId };
        }
      }

      const menuNameElement = document.querySelector(".menu-value___gLaLR");
      if (menuNameElement?.textContent) {
        CONFIG.currentUsername = menuNameElement.textContent.trim();
        const href = menuNameElement.getAttribute("href");
        const match = href?.match(/XID=(\d+)/);

        if (match) {
          CONFIG.currentUserId = match[1];
        }

        Logger.log(`Detected user from menu: ${CONFIG.currentUsername} ${CONFIG.currentUserId ? "(ID: " + CONFIG.currentUserId + ")" : ""}`);
        return { username: CONFIG.currentUsername, userId: CONFIG.currentUserId };
      }

      const profileLinks = document.querySelectorAll('a[href*="/profiles.php"]');
      for (const link of profileLinks) {
        const href = link.getAttribute("href");
        const text = link.textContent?.trim();

        if (text && href?.includes("XID=")) {
          const match = href.match(/XID=(\d+)/);
          if (match && text.length > 1 && !text.match(/view|info|profile|click|here/i)) {
            CONFIG.currentUsername = text;
            CONFIG.currentUserId = match[1];
            Logger.log(`Detected user from profile link: ${CONFIG.currentUsername} (ID: ${CONFIG.currentUserId})`);
            return { username: CONFIG.currentUsername, userId: CONFIG.currentUserId };
          }
        }
      }

      Logger.log("Could not auto-detect user info. Using fallback: Airfisher [4074952]");
      CONFIG.currentUsername = "Airfisher";
      CONFIG.currentUserId = "4074952";
      return { username: "Airfisher", userId: "4074952" };
    }

    static isOwnListing(listingUsername, listingUserId) {
      if (!CONFIG.currentUsername && !CONFIG.currentUserId) {
        this.detect();
      }

      // Check by username
      if (listingUsername && CONFIG.currentUsername) {
        if (listingUsername.toLowerCase() === CONFIG.currentUsername.toLowerCase()) {
          return true;
        }
      }

      // Check by user ID
      if (listingUserId && CONFIG.currentUserId) {
        return listingUserId.toString() === CONFIG.currentUserId.toString();
      }

      return false;
    }
  }

  // ========== STORAGE MANAGER ==========
  class StorageManager {
    static getAllValues() {
      try {
        const stored = localStorage.getItem(CONFIG.storageKey);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        Logger.error("Failed to load stored values:", error);
        return {};
      }
    }

    static getValue(itemID) {
      const allValues = this.getAllValues();
      return allValues[itemID] || null;
    }

    static setValue(itemID, value) {
      try {
        const allValues = this.getAllValues();
        allValues[itemID] = value;
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(allValues));
        Logger.log(`Saved value "${value}" for item ${itemID}`);

        setTimeout(() => {
          if (MarketListings.isHighlightingActive) {
            MarketListings.applyHighlighting();
          }
        }, 500);

        return true;
      } catch (error) {
        Logger.error("Failed to save value:", error);
        return false;
      }
    }

    static clearValue(itemID) {
      try {
        const allValues = this.getAllValues();
        if (allValues[itemID]) {
          delete allValues[itemID];
          localStorage.setItem(CONFIG.storageKey, JSON.stringify(allValues));
          Logger.log(`Cleared value for item ${itemID}`);

          setTimeout(() => {
            if (MarketListings.isHighlightingActive) {
              MarketListings.applyHighlighting();
            }
          }, 100);

          return true;
        }
        return false;
      } catch (error) {
        Logger.error("Failed to clear value:", error);
        return false;
      }
    }

    static clearAllValues() {
      try {
        localStorage.removeItem(CONFIG.storageKey);
        Logger.log("Cleared all saved values");

        if (MarketListings.isHighlightingActive) {
          MarketListings.removeAllHighlighting();
        }

        return true;
      } catch (error) {
        Logger.error("Failed to clear all values:", error);
        return false;
      }
    }

    static getAllItems() {
      const allValues = this.getAllValues();
      return Object.entries(allValues).map(([id, value]) => ({ id, value }));
    }

    static getStats() {
      const allValues = this.getAllValues();
      return {
        totalItems: Object.keys(allValues).length,
        items: Object.entries(allValues),
      };
    }
  }

  // ========== DOM UTILITIES ==========
  class DOMUtils {
    static waitForElement(selector, maxAttempts = CONFIG.retryAttempts, interval = 500) {
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
    }

    static injectCSS(css) {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      return style;
    }

    static isElementVisible(element) {
      return element && element.offsetParent !== null;
    }

    static updateInputPlaceholder(inputElement, itemID) {
      if (!inputElement || !itemID) return;

      const savedValue = StorageManager.getValue(itemID);
      if (savedValue) {
        inputElement.placeholder = `Replace Set Value`;
        inputElement.title = `Currently saved value: ${savedValue}`;
      } else {
        inputElement.placeholder = "Enter Value";
        inputElement.title = "Enter a value to save for this item";
      }
    }

    static showSavedValueIndicator(button, value) {
      if (!button) return;

      const existingIndicator = button.querySelector(".saved-value-indicator");
      if (existingIndicator) existingIndicator.remove();

      if (value) {
        const indicator = document.createElement("span");
        indicator.className = "saved-value-indicator";
        indicator.textContent = `(${value})`;
        button.appendChild(indicator);
      }
    }

    static updateListingsCount(button, count) {
      if (!button) return;

      const existingCount = button.querySelector(".listings-count");
      if (existingCount) existingCount.remove();

      if (count !== null && count !== undefined) {
        const countElement = document.createElement("span");
        countElement.className = "listings-count";
        countElement.textContent = `(${count})`;
        button.appendChild(countElement);
      }
    }

    static updateHighlightButton(button, isActive, dealCount = 0) {
      if (!button) return;

      const existingIndicator = button.querySelector(".highlight-indicator");
      if (existingIndicator) existingIndicator.remove();

      if (isActive) {
        button.classList.add("active");
        const indicator = document.createElement("span");
        indicator.className = "saved-value-indicator";
        indicator.textContent = `(${dealCount} deals)`;
        indicator.style.marginLeft = "5px";
        button.appendChild(indicator);
      } else {
        button.classList.remove("active");
      }
    }
  }

  // ========== MARKET LISTINGS MANAGER ==========
  class MarketListings {
    static currentListings = [];
    static isMonitoring = false;
    static pollInterval = null;
    static lastListingCount = 0;
    static isHighlightingActive = false;
    static highlightInterval = null;
    static ownListingsHighlightRetryCount = 0;
    static maxOwnListingsRetry = 10;

    static init() {
      UserDetector.detect();
      this.startMonitoring();
      this.startOwnListingsChecker();

      // ALWAYS start highlighting immediately when script loads
      setTimeout(() => {
        this.startHighlighting();
      }, 2000);
    }

    static startOwnListingsChecker() {
      // Continuously check for own listings - ALWAYS run, not just when highlighting is active
      setInterval(() => {
        this.highlightOwnListingsOnly();
      }, 2000);
    }

    static startMonitoring() {
      if (this.isMonitoring) return;

      this.isMonitoring = true;
      this.pollInterval = setInterval(() => {
        this.fetchAndProcessListings();
      }, CONFIG.listingsPollInterval);

      Logger.log("Market listings monitoring started");
      this.checkAndApplyHighlighting();
    }

    static stopMonitoring() {
      if (!this.isMonitoring) return;

      this.isMonitoring = false;
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      Logger.log("Market listings monitoring stopped");
    }

    static startHighlighting() {
      if (this.isHighlightingActive) return;

      this.isHighlightingActive = true;
      this.applyHighlighting();

      this.highlightInterval = setInterval(() => {
        this.applyHighlighting();
      }, 2000);

      Logger.log("Price highlighting activated");
    }

    static stopHighlighting() {
      if (!this.isHighlightingActive) return;

      this.isHighlightingActive = false;
      clearInterval(this.highlightInterval);
      this.highlightInterval = null;
      this.removeAllHighlighting();
      Logger.log("Price highlighting deactivated");
    }

    static toggleHighlighting() {
      if (this.isHighlightingActive) {
        this.stopHighlighting();
      } else {
        this.startHighlighting();
      }
      return this.isHighlightingActive;
    }

    static fetchAndProcessListings() {
      const listings = this.getAllListings();

      if (listings.length !== this.lastListingCount) {
        this.logListings(listings);
        this.lastListingCount = listings.length;

        // Always apply highlighting when listings change
        this.applyHighlighting();
      }

      return listings;
    }

    static getAllListings() {
      const listings = [];
      const sellerRows = document.querySelectorAll(".sellerRow___AI0m6");

      sellerRows.forEach((row, index) => {
        const listing = this.parseListingRow(row, index);
        if (listing) listings.push(listing);
      });

      return listings;
    }

    static parseListingRow(rowElement, index) {
      try {
        const userInfoBox = rowElement.querySelector(".userInfoBox___LRjPl");
        let username = "Unknown";
        let userId = null;
        let userStatus = "unknown";
        let isOwnListing = false;

        // Extract user info
        if (userInfoBox) {
          // Get username
          const honorText = userInfoBox.querySelector(".honor-text:not(.honor-text-svg)");
          if (honorText?.textContent) {
            username = honorText.textContent.trim();
          }

          if (username === "Unknown") {
            const honorSymbols = userInfoBox.querySelectorAll(".honorTextSymbol___PGzDa");
            if (honorSymbols.length > 0) {
              username = Array.from(honorSymbols)
                .map((symbol) => symbol.getAttribute("data-char") || symbol.textContent)
                .join("");
            }
          }

          if (username === "Unknown") {
            const honorImg = userInfoBox.querySelector(".honorContainer___huHQl img");
            if (honorImg?.alt) username = honorImg.alt.trim();
          }

          if (username === "Unknown") {
            const profileLink = userInfoBox.querySelector('a[href*="/profiles.php"]');
            if (profileLink?.getAttribute("title")) {
              username = profileLink.getAttribute("title").trim();
            }
          }

          // Get user status
          const statusSvg = userInfoBox.querySelector(".userStatusWrap___ljSJG svg");
          if (statusSvg) {
            const fill = statusSvg.getAttribute("fill") || "";
            if (fill.includes("online")) userStatus = "online";
            else if (fill.includes("offline")) userStatus = "offline";
            else if (fill.includes("idle")) userStatus = "idle";
          }

          // Get user ID
          const profileLink = userInfoBox.querySelector('a[href*="/profiles.php"]');
          const href = profileLink?.getAttribute("href");
          const match = href?.match(/XID=(\d+)/);
          if (match) userId = match[1];

          // Check if own listing
          isOwnListing = UserDetector.isOwnListing(username, userId);
        }

        // Get price
        let price = 0;
        const priceElement = rowElement.querySelector(".price___Uwiv2");
        if (priceElement) {
          const priceText = priceElement.textContent.replace("$", "").replace(/,/g, "").trim();
          price = parseFloat(priceText) || 0;
        }

        // Get quantity
        let quantity = 0;
        const quantityElement = rowElement.querySelector(".available___xegv_");
        if (quantityElement) {
          const quantityText = quantityElement.textContent.replace("available", "").replace(/,/g, "").trim();
          quantity = parseInt(quantityText) || 0;
        }

        return {
          username,
          userId,
          userStatus,
          price,
          quantity,
          totalValue: price * quantity,
          isOwnListing,
          element: rowElement,
        };
      } catch (error) {
        Logger.error(`Error parsing listing row ${index}:`, error);
        return null;
      }
    }

    static logListings(listings) {
      const ownListings = listings.filter((l) => l.isOwnListing);
      ownListings.forEach((listing) => {
        Logger.log(`Your listing: ${listing.username} - $${listing.price} (${listing.quantity} available)`);
      });

      Logger.log(listings);
      this.currentListings = listings;
      return listings;
    }

    static checkAndApplyHighlighting() {
      const currentItemID = MarketHelper.extractItemIDFromURL();
      if (currentItemID) {
        const listings = this.getAllListings();
        const hasOwnListings = listings.some((listing) => listing.isOwnListing);

        // ALWAYS start highlighting on any item page
        this.startHighlighting();
      }
    }

    static highlightOwnListingsOnly() {
      // This method specifically highlights only own listings
      const currentItemID = MarketHelper.extractItemIDFromURL();
      if (!currentItemID) return;

      const listings = this.getAllListings();
      let ownListingCount = 0;

      listings.forEach((listing) => {
        if (listing.isOwnListing) {
          ownListingCount++;
          // Always highlight own listings, even without saved value
          const savedValue = StorageManager.getValue(currentItemID);
          const targetValue = savedValue ? parseFloat(savedValue) : null;
          const hasTargetValue = !isNaN(targetValue) && targetValue !== null;
          const isGoodDeal = hasTargetValue ? listing.price < targetValue : false;

          if (hasTargetValue && isGoodDeal) {
            const discountPercent = ((targetValue - listing.price) / targetValue) * 100;
            this.highlightOwnListing(listing.element, discountPercent, targetValue, true);
          } else {
            // Highlight as regular own listing
            this.highlightOwnListing(listing.element, 0, targetValue, false);
          }
        }
      });

      // ALWAYS keep highlighting active if we find own listings
      if (ownListingCount > 0 && !this.isHighlightingActive) {
        this.startHighlighting();
      }
    }

    static applyHighlighting() {
      const currentItemID = MarketHelper.extractItemIDFromURL();
      if (!currentItemID) {
        Logger.log("No item ID found for highlighting");
        return 0;
      }

      const savedValue = StorageManager.getValue(currentItemID);
      const targetValue = savedValue ? parseFloat(savedValue) : null;
      const hasTargetValue = !isNaN(targetValue) && targetValue !== null;

      const listings = this.getAllListings();
      let dealCount = 0;
      let ownListingCount = 0;

      listings.forEach((listing) => {
        const isOwnListing = listing.isOwnListing;
        const isGoodDeal = hasTargetValue ? listing.price < targetValue : false;

        // ALWAYS highlight own listings
        if (isOwnListing) {
          ownListingCount++;
          if (hasTargetValue && isGoodDeal) {
            const discountPercent = ((targetValue - listing.price) / targetValue) * 100;
            this.highlightOwnListing(listing.element, discountPercent, targetValue, true);
            dealCount++;
          } else {
            // Highlight own listing (even without target value or if not a good deal)
            const discountPercent = hasTargetValue && listing.price < targetValue ? ((targetValue - listing.price) / targetValue) * 100 : 0;
            this.highlightOwnListing(listing.element, discountPercent, targetValue, isGoodDeal);
          }
        } else if (hasTargetValue && isGoodDeal) {
          const discountPercent = ((targetValue - listing.price) / targetValue) * 100;
          this.highlightListing(listing.element, discountPercent, targetValue, false);
          dealCount++;
        } else {
          this.removeHighlighting(listing.element, false);
        }
      });

      // ALWAYS keep highlighting active
      if (!this.isHighlightingActive) {
        this.startHighlighting();
      }

      if (MarketHelper.highlightButton) {
        DOMUtils.updateHighlightButton(MarketHelper.highlightButton, true, dealCount);
      }

      return dealCount;
    }

    static highlightListing(rowElement, discountPercent, targetValue) {
      this.removeHighlighting(rowElement);

      let highlightClass, indicatorClass;

      if (discountPercent >= 30) {
        highlightClass = "listing-excellent-deal";
        indicatorClass = "excellent-deal-indicator";
      } else if (discountPercent >= 15) {
        highlightClass = "listing-great-deal";
        indicatorClass = "great-deal-indicator";
      } else {
        highlightClass = "listing-good-deal";
        indicatorClass = "good-deal-indicator";
      }

      rowElement.classList.add(highlightClass);
      this.addDealIndicator(rowElement, discountPercent, targetValue, indicatorClass);
    }

    static highlightOwnListing(rowElement, discountPercent, targetValue, isGoodDeal = false) {
      this.removeHighlighting(rowElement, true);

      let highlightClass, indicatorClass;

      if (targetValue !== null && isGoodDeal) {
        if (discountPercent >= 30) {
          highlightClass = "listing-own-excellent-deal";
          indicatorClass = "own-excellent-deal-indicator";
        } else if (discountPercent >= 15) {
          highlightClass = "listing-own-good-deal";
          indicatorClass = "own-good-deal-indicator";
        } else {
          highlightClass = "listing-own-good-deal";
          indicatorClass = "own-good-deal-indicator";
        }
      } else {
        highlightClass = "listing-own-listing";
        indicatorClass = "own-listing-indicator";
      }

      rowElement.classList.add(highlightClass);
      this.addDealIndicator(rowElement, discountPercent, targetValue, indicatorClass, true);
    }

    static addDealIndicator(rowElement, discountPercent, targetValue, indicatorClass, isOwn = false) {
      const priceElement = rowElement.querySelector(".price___Uwiv2");
      if (!priceElement) return;

      const existingIndicator = priceElement.querySelector(".deal-indicator");
      if (existingIndicator) existingIndicator.remove();

      const indicator = document.createElement("span");
      indicator.className = `deal-indicator ${indicatorClass}`;

      if (isOwn) {
        if (targetValue !== null && discountPercent > 0) {
          indicator.title = `Your listing: ${discountPercent.toFixed(1)}% below target ($${targetValue})`;
          indicator.textContent = `YOURS -${discountPercent.toFixed(0)}%`;
        } else if (targetValue !== null) {
          indicator.title = `Your listing (target: $${targetValue})`;
          indicator.textContent = "YOUR LISTING";
        } else {
          indicator.title = "This is your listing";
          indicator.textContent = "YOUR LISTING";
        }
      } else {
        indicator.title = `${discountPercent.toFixed(1)}% below target ($${targetValue})`;
        indicator.textContent = `-${discountPercent.toFixed(0)}%`;
      }

      priceElement.appendChild(indicator);
    }

    static removeHighlighting(rowElement, removeOwnListings = false) {
      if (!removeOwnListings) {
        const listing = this.parseListingRow(rowElement, 0);
        if (listing?.isOwnListing) return;
      }

      rowElement.classList.remove(
        "listing-good-deal",
        "listing-great-deal",
        "listing-excellent-deal",
        "listing-own-listing",
        "listing-own-good-deal",
        "listing-own-excellent-deal"
      );

      const priceElement = rowElement.querySelector(".price___Uwiv2");
      const existingIndicator = priceElement?.querySelector(".deal-indicator");
      if (existingIndicator) existingIndicator.remove();
    }

    static removeAllHighlighting() {
      const rows = document.querySelectorAll(".sellerRow___AI0m6");
      rows.forEach((row) => this.removeHighlighting(row));

      if (MarketHelper.highlightButton) {
        DOMUtils.updateHighlightButton(MarketHelper.highlightButton, false);
      }

      Logger.log("Removed all highlighting");
    }

    static getListingsSummary() {
      if (this.currentListings.length === 0) {
        return { count: 0, totalQuantity: 0, totalValue: 0, ownListings: 0 };
      }

      const totalQuantity = this.currentListings.reduce((sum, listing) => sum + listing.quantity, 0);
      const totalValue = this.currentListings.reduce((sum, listing) => sum + listing.totalValue, 0);
      const ownListings = this.currentListings.filter((l) => l.isOwnListing);

      return {
        count: this.currentListings.length,
        totalQuantity,
        totalValue,
        ownListings: ownListings.length,
        listings: this.currentListings,
      };
    }

    static exportListings() {
      return JSON.stringify(this.currentListings, null, 2);
    }
  }

  // ========== MARKET HELPER ==========
  class MarketHelper {
    static inputElement = null;
    static setValueButton = null;
    static clearValueButton = null;
    static highlightButton = null;
    static currentItemID = null;

    static init() {
      this.setupStyles();
      this.setupObserver();
      this.attemptInitialInsertion();
      this.setupURLChangeListener();
      MarketListings.init();
    }

    static setupURLChangeListener() {
      window.addEventListener("hashchange", () => this.handleURLChange());
      setTimeout(() => this.handleURLChange(), 1000);
    }

    static handleURLChange() {
      const newItemID = this.extractItemIDFromURL();

      if (newItemID !== this.currentItemID) {
        this.currentItemID = newItemID;
        this.updateInputForCurrentItem();

        if (newItemID) {
          Logger.log(`Navigated to item ${newItemID}`);
          MarketListings.lastListingCount = 0;

          // ALWAYS start highlighting when URL changes
          setTimeout(() => {
            MarketListings.startHighlighting();
          }, 500);
        }
      }
    }

    static extractItemIDFromURL() {
      const currentUrl = window.location.href;
      const itemIdMatch = currentUrl.match(/[&?]itemID=(\d+)/);
      return itemIdMatch ? itemIdMatch[1] : null;
    }

    static updateInputForCurrentItem() {
      if (this.inputElement && this.currentItemID) {
        DOMUtils.updateInputPlaceholder(this.inputElement, this.currentItemID);

        const savedValue = StorageManager.getValue(this.currentItemID);
        if (this.setValueButton) {
          DOMUtils.showSavedValueIndicator(this.setValueButton, savedValue);
        }
      }
    }

    static setupStyles() {
      DOMUtils.injectCSS(STYLES);
    }

    static setupObserver() {
      const observer = new MutationObserver((mutations) => {
        if (!this.isSectionAdded() && this.shouldAddSection()) {
          this.addMarketHelperSection();
        }

        this.handleListingsChanges(mutations);

        const hasSearchInputChange = mutations.some((mutation) =>
          Array.from(mutation.addedNodes).some(
            (node) =>
              node.nodeType === 1 &&
              (node.classList?.contains("searchWrapper___GELIU") ||
                node.classList?.contains("autocompleteWrapper___xVTsm") ||
                node.querySelector?.('.searchInput___bwRsu[placeholder="Search for an item..."]'))
          )
        );

        if (hasSearchInputChange) {
          this.setupSearchInputHandlers();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    static handleListingsChanges(mutations) {
      const hasListingsChange = mutations.some(
        (mutation) =>
          Array.from(mutation.addedNodes).some((node) => node.classList?.contains("sellerRow___AI0m6") || node.classList?.contains("rowWrapper___me3Ox")) ||
          Array.from(mutation.removedNodes).some((node) => node.classList?.contains("sellerRow___AI0m6") || node.classList?.contains("rowWrapper___me3Ox"))
      );

      if (hasListingsChange) {
        setTimeout(() => {
          // ALWAYS apply highlighting when listings change
          MarketListings.applyHighlighting();
        }, 500);
      }
    }

    static attemptInitialInsertion() {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.addMarketHelperSection());
      } else {
        this.addMarketHelperSection();
      }
    }

    static shouldAddSection() {
      const targetElement = document.querySelector(CONFIG.targetSelector);
      return targetElement && DOMUtils.isElementVisible(targetElement);
    }

    static isSectionAdded() {
      return document.querySelector(".market-helper-section") !== null;
    }

    static addMarketHelperSection() {
      const targetElement = document.querySelector(CONFIG.targetSelector);

      if (!targetElement) {
        Logger.log("Target element not found, retrying...");
        setTimeout(() => this.addMarketHelperSection(), CONFIG.retryDelay);
        return;
      }

      if (this.isSectionAdded()) {
        Logger.log("Section already exists");
        return;
      }

      this.createAndInsertSection(targetElement);
      this.setupEventListeners();
      this.currentItemID = this.extractItemIDFromURL();
      this.updateInputForCurrentItem();
      Logger.log("Section added successfully");

      if (CONFIG.debug) {
        const stats = StorageManager.getStats();
        Logger.log(`Storage: ${stats.totalItems} items saved`);
        if (stats.totalItems > 0) console.table(stats.items);
      }
    }

    static createAndInsertSection(targetElement) {
      const container = document.createElement("div");
      container.innerHTML = CONFIG.equipmentHTML.trim();
      targetElement.prepend(container.firstElementChild);
    }

    static setupEventListeners() {
      this.inputElement = document.getElementById("market-helper-input");
      this.setValueButton = document.querySelector(".set-value-btn");
      this.clearValueButton = document.querySelector(".clear-value-btn");
      this.setupSearchInputHandlers();

      if (this.setValueButton) {
        this.setValueButton.addEventListener("click", () => this.handleSetValueClick());
      }

      if (this.clearValueButton) {
        this.clearValueButton.addEventListener("click", () => this.handleClearValueClick());
      }

      if (this.inputElement) {
        this.inputElement.addEventListener("keypress", (e) => {
          if (e.key === "Enter") this.handleSetValueClick();
        });

        this.inputElement.addEventListener("focus", () => {
          this.updateInputForCurrentItem();
        });
      }
    }

    static setupSearchInputHandlers() {
      const searchInput = document.querySelector('.searchInput___bwRsu[placeholder="Search for an item..."]');
      const marketHelperSection = document.querySelector(".market-helper-section");

      if (searchInput && marketHelperSection) {
        searchInput.addEventListener("focus", () => {
          marketHelperSection.classList.add("dimmed___NcfYf");
        });

        searchInput.addEventListener("blur", () => {
          marketHelperSection.classList.remove("dimmed___NcfYf");
        });

        const clearButton = document.querySelector(".closeButton___kyy2h");
        if (clearButton) {
          clearButton.addEventListener("click", () => {
            setTimeout(() => {
              marketHelperSection.classList.remove("dimmed___NcfYf");
            }, 100);
          });
        }

        Logger.log("Search input handlers added");
      } else {
        setTimeout(() => this.setupSearchInputHandlers(), 1000);
      }
    }

    static handleSetValueClick() {
      const inputValue = this.inputElement?.value.trim() || "";
      const itemID = this.extractItemIDFromURL();

      if (inputValue && itemID) {
        const saved = StorageManager.setValue(itemID, inputValue);
        if (saved) {
          this.inputElement.value = "";
          this.updateInputForCurrentItem();

          if (!MarketListings.isHighlightingActive) {
            MarketListings.startHighlighting();
          }
        }
      } else if (!itemID) {
        Logger.log("No item ID found in URL");
      } else {
        Logger.log("No input value provided");
      }
    }

    static handleClearValueClick() {
      const itemID = this.extractItemIDFromURL();

      if (itemID) {
        const cleared = StorageManager.clearValue(itemID);
        if (cleared) {
          Logger.log(`Cleared value for item ${itemID}`);
          this.updateInputForCurrentItem();
        } else {
          Logger.log(`No saved value found for item ${itemID}`);
        }
      } else {
        Logger.log("No item ID found in URL");
      }
    }
  }

  // ========== GLOBAL INITIALIZATION ==========
  Logger.log("Torn Market Helper v1.6 loading...");
  MarketHelper.init();

  // ========== DEBUG EXPOSURE ==========
  if (CONFIG.debug) {
    window.TornMarketHelper = {
      MarketHelper,
      StorageManager,
      MarketListings,
      DOMUtils,
      UserDetector,

      showAllSaved: () => {
        const allItems = StorageManager.getAllItems();
        console.log("All saved values:", allItems);
        return allItems;
      },

      clearAllSaved: () => {
        if (confirm("Clear ALL saved values?")) {
          StorageManager.clearAllValues();
          console.log("All values cleared");
        }
      },

      exportData: () => {
        const data = StorageManager.getAllValues();
        const json = JSON.stringify(data, null, 2);
        console.log("Export data:", json);
        return json;
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json);
          localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
          console.log("Data imported successfully");
          return true;
        } catch (error) {
          console.error("Failed to import data:", error);
          return false;
        }
      },

      getCurrentListings: () => {
        const listings = MarketListings.getAllListings();
        console.log("Current listings:", listings);
        return listings;
      },

      exportListings: () => {
        const json = MarketListings.exportListings();
        console.log("Exported listings:", json);
        return json;
      },

      getListingsSummary: () => {
        const summary = MarketListings.getListingsSummary();
        console.log("Listings summary:", summary);
        return summary;
      },

      startMonitoring: () => {
        MarketListings.startMonitoring();
        console.log("Listings monitoring started");
      },

      stopMonitoring: () => {
        MarketListings.stopMonitoring();
        console.log("Listings monitoring stopped");
      },

      startHighlighting: () => {
        MarketListings.startHighlighting();
        console.log("Highlighting started");
      },

      stopHighlighting: () => {
        MarketListings.stopHighlighting();
        console.log("Highlighting stopped");
      },

      toggleHighlighting: () => {
        const isActive = MarketListings.toggleHighlighting();
        console.log(`Highlighting ${isActive ? "activated" : "deactivated"}`);
        return isActive;
      },

      applyHighlighting: () => {
        const dealCount = MarketListings.applyHighlighting();
        console.log(`Applied highlighting - found ${dealCount} deals`);
        return dealCount;
      },

      removeHighlighting: () => {
        MarketListings.removeAllHighlighting();
        console.log("All highlighting removed");
      },

      highlightOwnListingsOnly: () => {
        MarketListings.highlightOwnListingsOnly();
        console.log("Highlighting own listings only");
      },

      detectUser: () => {
        const userInfo = UserDetector.detect();
        console.log("Detected user:", userInfo);
        return userInfo;
      },

      setUser: (username, userId) => {
        CONFIG.currentUsername = username;
        CONFIG.currentUserId = userId;
        console.log(`User set to: ${username} (ID: ${userId})`);
      },
    };

    Logger.log("Market Helper exposed globally as 'TornMarketHelper'");
  }
})();
