# bmiwatch

> 日本語のREADMEはこちらです: [README.ja.md](README.ja.md)

A simple, client-side web app for tracking your body weight and BMI. It's built with vanilla HTML, CSS, and JavaScript, and works entirely in your browser without a server.

## Live Demo

**https://code4fukui.github.io/bmiwatch/**

The interface displays your current BMI, healthy weight range, and progress toward your goal. A chart visualizes your weight trend over time.

## Features

-   **Record Data:** Log your weight with an automatic timestamp. Your height is saved in `localStorage` for convenience.
-   **Instant Feedback:** Immediately see your calculated BMI, your healthy weight range (based on BMI 18.5-25.0), and the difference to reach that range.
-   **Visualize Progress:** A line chart displays your weight trend over time, with guidelines for the healthy BMI range.
-   **Data Management:** Edit record timestamps, delete individual entries, or clear all data.
-   **Import/Export:** Easily back up and restore your data using CSV import and export functions.
-   **PWA Ready:** Installable on your home screen as a Progressive Web App for quick, offline-first access.
-   **User-Friendly Input:** Use stepper buttons (`+0.5`, `+0.1`, etc.) to make small adjustments to the weight input.
-   **Responsive Design:** A clean, modern interface that adapts to both desktop and mobile devices.

## Usage

Open `index.html` in a browser or use the [live demo site](https://code4fukui.github.io/bmiwatch/).

1.  Enter your weight and height and press "Record".
2.  Your height is saved locally, so you only need to enter your weight for subsequent records.
3.  View your current stats and progress on the chart and in the history table.
4.  To edit a record's timestamp, click on the time in the history table.
5.  Use the buttons at the bottom of the page to import, export, or delete all records.

## License

MIT