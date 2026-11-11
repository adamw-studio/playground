/** Fixed precision with a true minus sign, so columns of numbers align typographically. */
export function formatNumber(value: number, precision: number): string {
  const text = Math.abs(value) < 0.5 * 10 ** -precision ? (0).toFixed(precision) : value.toFixed(precision);
  return text.replace('-', '−');
}
