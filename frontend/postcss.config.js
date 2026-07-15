/** Local PostCSS config so Next.js does not pick up a parent directory (e.g. ~/postcss.config.js). */
module.exports = {
  plugins: {
    autoprefixer: {},
  },
};
