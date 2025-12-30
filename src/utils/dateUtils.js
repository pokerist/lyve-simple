/**
 * Date validation and adjustment utilities
 * Ensures HikCentral compatibility with 10-year date limits
 */

class DateUtils {
  /**
   * Validates and adjusts dates to ensure they don't exceed 10 years
   * @param {string|Date} fromDate - Start date
   * @param {string|Date} toDate - End date
   * @returns {Object} Adjusted dates and metadata
   */
  static validateAndAdjustDates(fromDate, toDate) {
    const start = this.parseDate(fromDate);
    const end = this.parseDate(toDate);
    
    if (!start || !end) {
      throw new Error('Invalid date format provided');
    }

    if (start > end) {
      throw new Error('Start date must be before end date');
    }

    const maxDuration = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years in milliseconds
    const actualDuration = end.getTime() - start.getTime();

    if (actualDuration > maxDuration) {
      // Adjust end date to exactly 10 years from start
      const adjustedEnd = new Date(start.getTime() + maxDuration);
      
      return {
        adjusted: true,
        from: this.formatDateForHikCentral(start),
        to: this.formatDateForHikCentral(adjustedEnd),
        originalFrom: this.formatDateForHikCentral(start),
        originalTo: this.formatDateForHikCentral(end),
        adjustmentReason: 'Date range exceeded 10 years, adjusted to maximum allowed duration'
      };
    }

    return {
      adjusted: false,
      from: this.formatDateForHikCentral(start),
      to: this.formatDateForHikCentral(end)
    };
  }

  /**
   * Parses date string or Date object to Date object
   * @param {string|Date} date - Date to parse
   * @returns {Date|null} Parsed date or null if invalid
   */
  static parseDate(date) {
    if (!date) return null;
    
    if (date instanceof Date) {
      return isNaN(date.getTime()) ? null : date;
    }
    
    if (typeof date === 'string') {
      const parsed = new Date(date);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    
    return null;
  }

  /**
   * Formats date for HikCentral API (ISO 8601 with timezone)
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  static formatDateForHikCentral(date) {
    try {
      // Format as ISO 8601 with timezone offset (e.g., "2025-01-01T00:00:00+02:00")
      const offset = date.getTimezoneOffset();
      const offsetHours = Math.abs(Math.floor(offset / 60));
      const offsetMinutes = Math.abs(offset % 60);
      const offsetSign = offset >= 0 ? '-' : '+';
      const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
      
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
    } catch (error) {
      throw new Error(`Error formatting date: ${error.message}`);
    }
  }

  /**
   * Validates if a date is within acceptable range
   * @param {string|Date} date - Date to validate
   * @param {number} maxYears - Maximum years from now (default: 10)
   * @returns {boolean} True if date is valid
   */
  static isValidDateRange(date, maxYears = 10) {
    const parsedDate = this.parseDate(date);
    if (!parsedDate) return false;

    const now = new Date();
    const maxDate = new Date(now.getTime() + (maxYears * 365 * 24 * 60 * 60 * 1000));
    
    return parsedDate >= now && parsedDate <= maxDate;
  }

  /**
   * Gets the maximum allowed end date for a given start date
   * @param {string|Date} fromDate - Start date
   * @param {number} maxYears - Maximum years (default: 10)
   * @returns {Date} Maximum allowed end date
   */
  static getMaxEndDate(fromDate, maxYears = 10) {
    const start = this.parseDate(fromDate);
    if (!start) throw new Error('Invalid start date');
    
    return new Date(start.getTime() + (maxYears * 365 * 24 * 60 * 60 * 1000));
  }

  /**
   * Calculates the duration between two dates in years
   * @param {string|Date} fromDate - Start date
   * @param {string|Date} toDate - End date
   * @returns {number} Duration in years
   */
  static getDurationInYears(fromDate, toDate) {
    const start = this.parseDate(fromDate);
    const end = this.parseDate(toDate);
    
    if (!start || !end) return 0;
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    return Math.round(diffYears * 100) / 100; // Round to 2 decimal places
  }
}

module.exports = DateUtils;
