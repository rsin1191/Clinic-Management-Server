module.exports = {
  testEnvironment: "node",

  collectCoverage: true,

  collectCoverageFrom: [
    "controllers/**/*.js",
    "middlewares/**/*.js",
    "models/**/*.js",
    "routes/**/*.js",
    "utils/**/*.js",
  ],

  coverageDirectory: "coverage",

  coveragePathIgnorePatterns: ["/node_modules/", "/tests/"],
};
