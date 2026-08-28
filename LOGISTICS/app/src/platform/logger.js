const ts = () => new Date().toISOString();

module.exports = {
  info: (...args) => console.log(ts(), '[info]', ...args),
  warn: (...args) => console.warn(ts(), '[warn]', ...args),
  error: (...args) => console.error(ts(), '[error]', ...args),
};
