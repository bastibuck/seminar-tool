# Interactive Finding image inspection

The Viewer will support interactive Finding image inspection with continuous, pointer-anchored zoom, drag panning constrained to the image bounds, pinch and wheel gestures, visible controls, keyboard controls, and reset-on-close behavior. Use `react-zoom-pan-pinch` rather than implementing gesture math in the application; retain the existing lightbox and accessibility shell, and verify the interaction manually for now instead of adding Playwright or another UI test framework.

The inspection scope remains limited to the selected Finding: no gallery navigation, annotations, or image editing. The relative zoom range is 100% to 800%, with 100% representing the fitted, fully visible image.
