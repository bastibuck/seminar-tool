# Interactive Finding image inspection

The Viewer supports interactive Finding image inspection with a complete, fitted initial image for every aspect ratio; wheel and pinch zoom; bounded drag panning; visible zoom-in, zoom-out, and reset icon controls; and reset-on-close behavior. Use `react-zoom-pan-pinch` rather than implementing gesture math in the application. The transform content is the fitted Finding image, centered inside the full lightbox image stage before zooming. Retain the existing lightbox dialog, focus trapping, and focus restoration, and verify the interaction manually for now instead of adding Playwright or another UI test framework.

Keyboard support is limited to `Escape` for closing the lightbox and `Tab` for focus trapping. The Viewer does not provide keyboard zoom or pan commands, a visible zoom percentage, or a live zoom-status announcement.

The inspection scope remains limited to the selected Finding: no gallery navigation, annotations, or image editing. The zoom range is 100% to 800%, with 100% representing the fitted, fully visible image.
