module.exports = (api) => {
  api.cache(true);
  // babel-preset-expo adds the react-native-worklets/reanimated plugin when those
  // packages are installed (required by react-native-keyboard-controller / reanimated,
  // including on web where reanimated otherwise throws "runtime not ready").
  return {
    presets: ["babel-preset-expo"],
  };
};
