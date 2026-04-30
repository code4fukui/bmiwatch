# bmiwatch

[日本語](README.ja.md)

A small web app for recording body weight and checking progress toward a target BMI.

Live demo:
https://code4fukui.github.io/bmiwatch/

## Features

- Record body weight with the current timestamp
- Save height and target BMI in `localStorage`
- Auto-set the first target BMI to the standard upper limit of 25.0 when the first BMI is above that range
- Calculate current BMI, target weight, and remaining weight difference
- Show a weight trend chart with target weight and standard BMI lower/upper guide lines
- Edit record timestamps and delete records
- Import and export records as CSV

## Files

- `index.html` - app structure
- `style.css` - UI styles
- `main.js` - app logic and `localStorage` handling

## Usage

Open `index.html` in a browser, or use the GitHub Pages site above.

## License

MIT
