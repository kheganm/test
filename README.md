# Flowchart Builder

A powerful, responsive web-based flowchart creation tool that works seamlessly on both desktop and mobile devices. Create professional flowcharts with ease, featuring multiple connector types, customizable boxes, and versatile export options.

## Features

### Core Functionality
- **Drag and Drop Interface**: Easily move boxes and their connectors around the canvas
- **Multiple Box Shapes**: Rectangle, Rounded Rectangle, Ellipse, Diamond, and Parallelogram
- **Customizable Colors**: 8 preset colors plus custom color picker
- **Multiple Connector Types**:
  - Straight lines
  - Curved connections
  - Orthogonal (right-angle) paths
- **Connector Labels**: Add descriptive labels to any connector
- **Arrow Customization**: Choose from end arrow, both ends, or no arrows

### Export Options
Export your flowcharts in multiple formats:
- **PNG**: High-quality raster image
- **JPG**: Compressed image format
- **SVG**: Scalable vector graphics
- **PPTX**: PowerPoint presentation format

### Additional Features
- **Save/Load**: Save your work as JSON and load it later
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Touch Support**: Full touch gesture support for mobile devices
- **Grid Background**: Optional grid for precise alignment
- **Selection Tools**: Select, edit, duplicate, and delete elements
- **Real-time Preview**: See changes instantly as you work

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- No installation required - runs entirely in the browser

### Usage

1. **Open the Application**
   - Simply open `index.html` in your web browser
   - Or serve it using a local web server

2. **Creating Boxes**
   - Click the "Box" mode button
   - Click anywhere on the canvas to create a box
   - Customize color, shape, and text in the sidebar

3. **Moving Boxes**
   - Switch to "Select" mode
   - Click and drag boxes to reposition them
   - Connectors automatically update

4. **Creating Connectors**
   - Click the "Connect" mode button
   - Click on a source box
   - Click on a destination box
   - The connector is created automatically

5. **Customizing Elements**
   - Select any element by clicking it in "Select" mode
   - Use the sidebar to modify properties
   - Changes apply in real-time

6. **Exporting**
   - Click the "Export" button
   - Choose your desired format (PNG, JPG, SVG, or PPTX)
   - The file downloads automatically

## Interface Guide

### Toolbar (Top)
- **Clear**: Remove all elements from the canvas
- **Save**: Save your flowchart as JSON
- **Load**: Load a previously saved flowchart
- **Export**: Export to various formats

### Sidebar (Left)

#### Tools Section
- **Select Mode**: Click and drag to move boxes
- **Box Mode**: Click to create new boxes
- **Connect Mode**: Click boxes to connect them

#### Box Settings
- **Color**: Choose from presets or use custom colors
- **Shape**: Select from 5 different shapes
- **Text**: Add or edit box labels

#### Connector Settings
- **Type**: Straight, Curved, or Orthogonal
- **Label**: Add descriptive text to connectors
- **Arrow**: Choose arrow style

#### Selection Actions (appears when element is selected)
- **Delete Selected**: Remove the selected element
- **Duplicate**: Create a copy of the selected box

### Canvas (Center)
- Main drawing area
- Grid background for alignment
- Status information at bottom

## Keyboard Shortcuts

- **Delete**: Remove selected element (when available)
- **Double-tap** (mobile): Quick box creation

## Mobile Usage

The application is fully optimized for mobile devices:

1. **Touch Gestures**
   - Single tap: Select elements
   - Drag: Move boxes
   - Double tap: Quick create box

2. **Responsive Interface**
   - Sidebar adapts for mobile screens
   - Touch-friendly buttons and controls
   - Optimized canvas size

3. **Tips for Mobile**
   - Use landscape mode for more workspace
   - Pinch-to-zoom supported on canvas
   - Button icons visible for space efficiency

## File Formats

### JSON (Save/Load)
- Preserves complete flowchart structure
- Maintains all properties and connections
- Human-readable format

### PNG/JPG
- High-quality raster images
- White background included
- Suitable for documents and presentations

### SVG
- Scalable vector format
- Maintains quality at any size
- Editable in vector graphics software

### PPTX
- PowerPoint format
- Fully editable in Microsoft PowerPoint
- Shapes and text remain editable

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Technical Details

### Technologies Used
- HTML5 Canvas for rendering
- Vanilla JavaScript (no framework dependencies)
- CSS3 for responsive design
- PptxGenJS for PowerPoint export

### Performance
- Optimized rendering engine
- Handles hundreds of elements smoothly
- Efficient memory management
- Fast export processing

## Tips and Best Practices

1. **Organization**
   - Use different colors to categorize box types
   - Label connectors for complex flows
   - Use appropriate shapes for different purposes (diamond for decisions, etc.)

2. **Layout**
   - Start from top-left for conventional flow
   - Use orthogonal connectors for cleaner diagrams
   - Leverage the grid for alignment

3. **Workflow**
   - Create all boxes first, then add connectors
   - Save frequently while working
   - Export to SVG for maximum flexibility

4. **Mobile**
   - Work in landscape for more space
   - Use preset colors for faster workflow
   - Save often due to potential browser memory limits

## Troubleshooting

### Canvas not rendering
- Refresh the browser
- Check browser console for errors
- Ensure JavaScript is enabled

### Export not working
- Check popup blocker settings
- Ensure sufficient browser permissions
- Try a different export format

### Performance issues
- Reduce number of elements
- Clear and restart for complex diagrams
- Close other browser tabs

## Future Enhancements

Potential features for future versions:
- Undo/Redo functionality
- Copy/Paste support
- Multi-select capability
- Alignment guides
- Snap-to-grid option
- Custom templates
- Collaborative editing
- Cloud storage integration

## License

This project is open source and available for personal and commercial use.

## Support

For issues, suggestions, or contributions, please refer to the project repository.

---

**Version**: 1.0.0
**Last Updated**: 2026-01-03

Happy Flowcharting!
