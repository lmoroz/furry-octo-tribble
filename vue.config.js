// vue.config.js
// https://cli.vuejs.org/ru/config/
module.exports = {
  outputDir: '../build',
  filenameHashing: false,
  configureWebpack: {
    optimization: {
      minimize: true,
      namedModules: true,
      namedChunks: true,
      removeAvailableModules: true,
      flagIncludedChunks: true,
      occurrenceOrder: false,
      usedExports: true,
      concatenateModules: true,
      sideEffects: false, // <----- in prod defaults to true if left blank
    },
  },
}
