/**
 * Converts a line width setting to a numeric character count
 * @param width The width setting as a string or number
 * @param isHanzi Whether the text uses Hanzi characters (Chinese, Japanese)
 * @returns The number of characters per line
 */
export function convertLineWidth(width: string | number, isHanzi: boolean): number {
  if (typeof width === 'number') return width;

  if (!isHanzi) {
    switch (width.toLowerCase()) {
      case 'small': return 30;
      case 'medium': return 38;
      case 'large': return 52;
      default:
        return 38;
    }
  } else {
    switch (width.toLowerCase()) {
      case 'small': return 10;
      case 'medium': return 14;
      case 'large': return 21;
      default:
        return 14;
    }
  }
}