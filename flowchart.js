// Flowchart Builder Application
class FlowchartApp {
    constructor() {
        this.canvas = document.getElementById('flowchartCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Data structures
        this.boxes = [];
        this.connectors = [];
        this.selectedBox = null;
        this.selectedConnector = null;
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };

        // Mode and settings
        this.mode = 'select'; // 'select', 'box', 'connector'
        this.connectorStart = null;
        this.tempConnectorEnd = null;

        // Settings
        this.settings = {
            boxColor: '#3498db',
            boxShape: 'rectangle',
            boxText: '',
            connectorType: 'straight',
            connectorLabel: '',
            arrowType: 'end'
        };

        // Touch support
        this.lastTouchEnd = 0;

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupEventListeners();
        this.render();

        // Resize handler
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.render();
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Mode buttons
        document.getElementById('selectMode').addEventListener('click', () => this.setMode('select'));
        document.getElementById('boxMode').addEventListener('click', () => this.setMode('box'));
        document.getElementById('connectorMode').addEventListener('click', () => this.setMode('connector'));

        // Settings
        document.getElementById('boxColor').addEventListener('change', (e) => {
            this.settings.boxColor = e.target.value;
            if (this.selectedBox) {
                this.selectedBox.color = e.target.value;
                this.render();
            }
        });

        document.getElementById('boxShape').addEventListener('change', (e) => {
            this.settings.boxShape = e.target.value;
            if (this.selectedBox) {
                this.selectedBox.shape = e.target.value;
                this.render();
            }
        });

        document.getElementById('boxText').addEventListener('input', (e) => {
            this.settings.boxText = e.target.value;
            if (this.selectedBox) {
                this.selectedBox.text = e.target.value;
                this.render();
            }
        });

        document.getElementById('connectorType').addEventListener('change', (e) => {
            this.settings.connectorType = e.target.value;
        });

        document.getElementById('connectorLabel').addEventListener('input', (e) => {
            this.settings.connectorLabel = e.target.value;
            if (this.selectedConnector) {
                this.selectedConnector.label = e.target.value;
                this.render();
            }
        });

        document.getElementById('arrowType').addEventListener('change', (e) => {
            this.settings.arrowType = e.target.value;
        });

        // Color presets
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.settings.boxColor = color;
                document.getElementById('boxColor').value = color;
                if (this.selectedBox) {
                    this.selectedBox.color = color;
                    this.render();
                }
            });
        });

        // Actions
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());
        document.getElementById('saveBtn').addEventListener('click', () => this.save());
        document.getElementById('loadBtn').addEventListener('click', () => this.load());
        document.getElementById('deleteSelected').addEventListener('click', () => this.deleteSelected());
        document.getElementById('duplicateSelected').addEventListener('click', () => this.duplicate());

        // Export
        document.getElementById('exportPNG').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportImage('png');
        });
        document.getElementById('exportJPG').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportImage('jpg');
        });
        document.getElementById('exportSVG').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportSVG();
        });
        document.getElementById('exportPPTX').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportPPTX();
        });
    }

    setMode(mode) {
        this.mode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${mode}Mode`).classList.add('active');

        // Update cursor
        if (mode === 'select') {
            this.canvas.style.cursor = 'default';
        } else if (mode === 'box') {
            this.canvas.style.cursor = 'crosshair';
        } else if (mode === 'connector') {
            this.canvas.style.cursor = 'crosshair';
        }

        // Clear connector start if switching modes
        if (mode !== 'connector') {
            this.connectorStart = null;
            this.tempConnectorEnd = null;
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getTouchPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0] || e.changedTouches[0];
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);

        if (this.mode === 'select') {
            // Check if clicking on a box
            const box = this.getBoxAtPosition(pos.x, pos.y);
            if (box) {
                this.selectedBox = box;
                this.selectedConnector = null;
                this.dragging = true;
                this.dragOffset = {
                    x: pos.x - box.x,
                    y: pos.y - box.y
                };
                this.updateSelectionPanel();
                this.render();
            } else {
                // Check if clicking on a connector
                const connector = this.getConnectorAtPosition(pos.x, pos.y);
                if (connector) {
                    this.selectedConnector = connector;
                    this.selectedBox = null;
                    this.updateSelectionPanel();
                    this.render();
                } else {
                    this.selectedBox = null;
                    this.selectedConnector = null;
                    this.updateSelectionPanel();
                    this.render();
                }
            }
        } else if (this.mode === 'box') {
            this.createBox(pos.x, pos.y);
        } else if (this.mode === 'connector') {
            if (!this.connectorStart) {
                const box = this.getBoxAtPosition(pos.x, pos.y);
                if (box) {
                    this.connectorStart = box;
                }
            } else {
                const box = this.getBoxAtPosition(pos.x, pos.y);
                if (box && box !== this.connectorStart) {
                    this.createConnector(this.connectorStart, box);
                    this.connectorStart = null;
                    this.tempConnectorEnd = null;
                    this.render();
                }
            }
        }
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.mode === 'select' && this.dragging && this.selectedBox) {
            this.selectedBox.x = pos.x - this.dragOffset.x;
            this.selectedBox.y = pos.y - this.dragOffset.y;
            this.render();
        } else if (this.mode === 'connector' && this.connectorStart) {
            this.tempConnectorEnd = pos;
            this.render();
        }
    }

    handleMouseUp(e) {
        this.dragging = false;
    }

    handleTouchStart(e) {
        e.preventDefault();
        const pos = this.getTouchPos(e);

        // Double tap detection
        const now = Date.now();
        if (now - this.lastTouchEnd < 300) {
            // Double tap - switch to box mode and create
            if (this.mode === 'select') {
                this.setMode('box');
                this.createBox(pos.x, pos.y);
            }
        }

        this.handleMouseDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        this.lastTouchEnd = now;
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            this.handleMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.handleMouseUp(e);
    }

    handleContextMenu(e) {
        e.preventDefault();
        // Could add context menu here
    }

    createBox(x, y) {
        const box = {
            id: Date.now(),
            x: x - 60,
            y: y - 30,
            width: 120,
            height: 60,
            color: this.settings.boxColor,
            shape: this.settings.boxShape,
            text: this.settings.boxText || 'New Box'
        };
        this.boxes.push(box);
        this.selectedBox = box;
        this.updateSelectionPanel();
        this.render();
    }

    createConnector(fromBox, toBox) {
        const connector = {
            id: Date.now(),
            from: fromBox.id,
            to: toBox.id,
            type: this.settings.connectorType,
            label: this.settings.connectorLabel,
            arrowType: this.settings.arrowType
        };
        this.connectors.push(connector);
    }

    getBoxAtPosition(x, y) {
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];
            if (this.isPointInBox(x, y, box)) {
                return box;
            }
        }
        return null;
    }

    isPointInBox(x, y, box) {
        if (box.shape === 'ellipse') {
            const dx = x - (box.x + box.width / 2);
            const dy = y - (box.y + box.height / 2);
            return (dx * dx) / ((box.width / 2) * (box.width / 2)) +
                   (dy * dy) / ((box.height / 2) * (box.height / 2)) <= 1;
        } else if (box.shape === 'diamond') {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const dx = Math.abs(x - cx);
            const dy = Math.abs(y - cy);
            return dx / (box.width / 2) + dy / (box.height / 2) <= 1;
        } else {
            return x >= box.x && x <= box.x + box.width &&
                   y >= box.y && y <= box.y + box.height;
        }
    }

    getConnectorAtPosition(x, y) {
        for (let i = this.connectors.length - 1; i >= 0; i--) {
            const connector = this.connectors[i];
            const fromBox = this.boxes.find(b => b.id === connector.from);
            const toBox = this.boxes.find(b => b.id === connector.to);

            if (fromBox && toBox) {
                const start = this.getBoxCenter(fromBox);
                const end = this.getBoxCenter(toBox);

                // Simple distance check to line
                const dist = this.distanceToLine(x, y, start.x, start.y, end.x, end.y);
                if (dist < 10) {
                    return connector;
                }
            }
        }
        return null;
    }

    distanceToLine(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getBoxCenter(box) {
        return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2
        };
    }

    getBoxConnectionPoint(fromBox, toBox) {
        const fromCenter = this.getBoxCenter(fromBox);
        const toCenter = this.getBoxCenter(toBox);

        // Calculate angle
        const angle = Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);

        // Get edge points
        const fromPoint = this.getBoxEdgePoint(fromBox, angle);
        const toAngle = Math.atan2(fromCenter.y - toCenter.y, fromCenter.x - toCenter.x);
        const toPoint = this.getBoxEdgePoint(toBox, toAngle);

        return { from: fromPoint, to: toPoint };
    }

    getBoxEdgePoint(box, angle) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;

        if (box.shape === 'ellipse') {
            const a = box.width / 2;
            const b = box.height / 2;
            const x = cx + a * Math.cos(angle);
            const y = cy + b * Math.sin(angle);
            return { x, y };
        } else if (box.shape === 'diamond') {
            const hw = box.width / 2;
            const hh = box.height / 2;

            // Find intersection with diamond edges
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Normalize to diamond space
            const t = Math.min(
                Math.abs(hw / cos),
                Math.abs(hh / sin)
            );

            return {
                x: cx + t * cos,
                y: cy + t * sin
            };
        } else {
            // Rectangle, rounded rectangle, parallelogram
            const hw = box.width / 2;
            const hh = box.height / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            let x, y;
            if (Math.abs(cos) > Math.abs(sin) * (box.width / box.height)) {
                x = cx + (cos > 0 ? hw : -hw);
                y = cy + (cos > 0 ? hw : -hw) * Math.tan(angle);
            } else {
                x = cx + (sin > 0 ? hh : -hh) / Math.tan(angle);
                y = cy + (sin > 0 ? hh : -hh);
            }

            return { x, y };
        }
    }

    updateSelectionPanel() {
        const panel = document.getElementById('selectionActions');

        if (this.selectedBox) {
            panel.style.display = 'block';
            document.getElementById('boxText').value = this.selectedBox.text;
            document.getElementById('boxColor').value = this.selectedBox.color;
            document.getElementById('boxShape').value = this.selectedBox.shape;
        } else if (this.selectedConnector) {
            panel.style.display = 'block';
            document.getElementById('connectorLabel').value = this.selectedConnector.label || '';
        } else {
            panel.style.display = 'none';
        }
    }

    deleteSelected() {
        if (this.selectedBox) {
            // Remove box
            this.boxes = this.boxes.filter(b => b.id !== this.selectedBox.id);
            // Remove connectors attached to this box
            this.connectors = this.connectors.filter(c =>
                c.from !== this.selectedBox.id && c.to !== this.selectedBox.id
            );
            this.selectedBox = null;
        } else if (this.selectedConnector) {
            // Remove connector
            this.connectors = this.connectors.filter(c => c.id !== this.selectedConnector.id);
            this.selectedConnector = null;
        }
        this.updateSelectionPanel();
        this.render();
    }

    duplicate() {
        if (this.selectedBox) {
            const newBox = {
                ...this.selectedBox,
                id: Date.now(),
                x: this.selectedBox.x + 20,
                y: this.selectedBox.y + 20
            };
            this.boxes.push(newBox);
            this.selectedBox = newBox;
            this.render();
        }
    }

    clear() {
        if (confirm('Are you sure you want to clear the canvas?')) {
            this.boxes = [];
            this.connectors = [];
            this.selectedBox = null;
            this.selectedConnector = null;
            this.updateSelectionPanel();
            this.render();
        }
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid (optional)
        this.drawGrid();

        // Draw connectors first (so they're behind boxes)
        this.connectors.forEach(connector => this.drawConnector(connector));

        // Draw temporary connector
        if (this.connectorStart && this.tempConnectorEnd) {
            this.drawTempConnector(this.connectorStart, this.tempConnectorEnd);
        }

        // Draw boxes
        this.boxes.forEach(box => this.drawBox(box));
    }

    drawGrid() {
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;

        const gridSize = 20;

        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawBox(box) {
        this.ctx.save();

        // Highlight if selected
        if (this.selectedBox === box) {
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
        } else {
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
        }

        this.ctx.fillStyle = box.color;

        // Draw shape
        this.ctx.beginPath();

        switch (box.shape) {
            case 'rectangle':
                this.ctx.rect(box.x, box.y, box.width, box.height);
                break;

            case 'rounded':
                this.drawRoundedRect(box.x, box.y, box.width, box.height, 10);
                break;

            case 'ellipse':
                this.ctx.ellipse(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    box.width / 2,
                    box.height / 2,
                    0, 0, 2 * Math.PI
                );
                break;

            case 'diamond':
                this.ctx.moveTo(box.x + box.width / 2, box.y);
                this.ctx.lineTo(box.x + box.width, box.y + box.height / 2);
                this.ctx.lineTo(box.x + box.width / 2, box.y + box.height);
                this.ctx.lineTo(box.x, box.y + box.height / 2);
                this.ctx.closePath();
                break;

            case 'parallelogram':
                const offset = 15;
                this.ctx.moveTo(box.x + offset, box.y);
                this.ctx.lineTo(box.x + box.width, box.y);
                this.ctx.lineTo(box.x + box.width - offset, box.y + box.height);
                this.ctx.lineTo(box.x, box.y + box.height);
                this.ctx.closePath();
                break;
        }

        this.ctx.fill();
        this.ctx.stroke();

        // Draw text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.wrapText(box.text, box.width - 10);
        const lineHeight = 16;
        const startY = box.y + box.height / 2 - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, i) => {
            this.ctx.fillText(
                line,
                box.x + box.width / 2,
                startY + i * lineHeight
            );
        });

        this.ctx.restore();
    }

    drawRoundedRect(x, y, width, height, radius) {
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
    }

    wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        this.ctx.font = '14px Arial';

        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = this.ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.length > 0 ? lines : [''];
    }

    drawConnector(connector) {
        const fromBox = this.boxes.find(b => b.id === connector.from);
        const toBox = this.boxes.find(b => b.id === connector.to);

        if (!fromBox || !toBox) return;

        const points = this.getBoxConnectionPoint(fromBox, toBox);

        this.ctx.save();

        // Highlight if selected
        if (this.selectedConnector === connector) {
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 2;
        }

        this.ctx.beginPath();

        switch (connector.type) {
            case 'straight':
                this.ctx.moveTo(points.from.x, points.from.y);
                this.ctx.lineTo(points.to.x, points.to.y);
                break;

            case 'curved':
                const cp1x = points.from.x + (points.to.x - points.from.x) * 0.5;
                const cp1y = points.from.y;
                const cp2x = points.from.x + (points.to.x - points.from.x) * 0.5;
                const cp2y = points.to.y;

                this.ctx.moveTo(points.from.x, points.from.y);
                this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points.to.x, points.to.y);
                break;

            case 'orthogonal':
                const midX = (points.from.x + points.to.x) / 2;

                this.ctx.moveTo(points.from.x, points.from.y);
                this.ctx.lineTo(midX, points.from.y);
                this.ctx.lineTo(midX, points.to.y);
                this.ctx.lineTo(points.to.x, points.to.y);
                break;
        }

        this.ctx.stroke();

        // Draw arrows
        if (connector.arrowType === 'end' || connector.arrowType === 'both') {
            this.drawArrow(points.to.x, points.to.y, points.from.x, points.from.y);
        }
        if (connector.arrowType === 'both') {
            this.drawArrow(points.from.x, points.from.y, points.to.x, points.to.y);
        }

        // Draw label
        if (connector.label) {
            const midX = (points.from.x + points.to.x) / 2;
            const midY = (points.from.y + points.to.y) / 2;

            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 1;

            const textMetrics = this.ctx.measureText(connector.label);
            const padding = 4;

            this.ctx.fillRect(
                midX - textMetrics.width / 2 - padding,
                midY - 10,
                textMetrics.width + padding * 2,
                20
            );
            this.ctx.strokeRect(
                midX - textMetrics.width / 2 - padding,
                midY - 10,
                textMetrics.width + padding * 2,
                20
            );

            this.ctx.fillStyle = '#2c3e50';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(connector.label, midX, midY);
        }

        this.ctx.restore();
    }

    drawArrow(x, y, fromX, fromY) {
        const angle = Math.atan2(y - fromY, x - fromX);
        const arrowLength = 15;
        const arrowWidth = 8;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);

        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-arrowLength, -arrowWidth);
        this.ctx.lineTo(-arrowLength, arrowWidth);
        this.ctx.closePath();

        this.ctx.fillStyle = this.ctx.strokeStyle;
        this.ctx.fill();

        this.ctx.restore();
    }

    drawTempConnector(fromBox, toPos) {
        const start = this.getBoxCenter(fromBox);

        this.ctx.save();
        this.ctx.strokeStyle = '#95a5a6';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(toPos.x, toPos.y);
        this.ctx.stroke();

        this.ctx.restore();
    }

    save() {
        const data = {
            boxes: this.boxes,
            connectors: this.connectors
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `flowchart-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    load() {
        const input = document.getElementById('fileInput');
        input.click();

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.boxes = data.boxes || [];
                    this.connectors = data.connectors || [];
                    this.selectedBox = null;
                    this.selectedConnector = null;
                    this.updateSelectionPanel();
                    this.render();
                } catch (err) {
                    alert('Error loading file: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
    }

    exportImage(format) {
        // Create a temporary canvas with white background
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Fill with white background
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw current canvas on top
        tempCtx.drawImage(this.canvas, 0, 0);

        // Export
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const url = tempCanvas.toDataURL(mimeType, 0.9);

        const a = document.createElement('a');
        a.href = url;
        a.download = `flowchart-${Date.now()}.${format}`;
        a.click();
    }

    exportSVG() {
        let svg = `<svg width="${this.canvas.width}" height="${this.canvas.height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += '<rect width="100%" height="100%" fill="white"/>';

        // Draw connectors
        this.connectors.forEach(connector => {
            const fromBox = this.boxes.find(b => b.id === connector.from);
            const toBox = this.boxes.find(b => b.id === connector.to);

            if (!fromBox || !toBox) return;

            const points = this.getBoxConnectionPoint(fromBox, toBox);

            if (connector.type === 'straight') {
                svg += `<line x1="${points.from.x}" y1="${points.from.y}" x2="${points.to.x}" y2="${points.to.y}" stroke="#2c3e50" stroke-width="2"/>`;
            }

            // Add arrow
            const angle = Math.atan2(points.to.y - points.from.y, points.to.x - points.from.x);
            const arrowLength = 15;
            const arrowWidth = 8;
            const x1 = points.to.x - arrowLength * Math.cos(angle - Math.PI / 6);
            const y1 = points.to.y - arrowLength * Math.sin(angle - Math.PI / 6);
            const x2 = points.to.x - arrowLength * Math.cos(angle + Math.PI / 6);
            const y2 = points.to.y - arrowLength * Math.sin(angle + Math.PI / 6);

            svg += `<polygon points="${points.to.x},${points.to.y} ${x1},${y1} ${x2},${y2}" fill="#2c3e50"/>`;

            // Add label
            if (connector.label) {
                const midX = (points.from.x + points.to.x) / 2;
                const midY = (points.from.y + points.to.y) / 2;
                svg += `<text x="${midX}" y="${midY}" text-anchor="middle" fill="#2c3e50" font-size="12">${connector.label}</text>`;
            }
        });

        // Draw boxes
        this.boxes.forEach(box => {
            if (box.shape === 'rectangle' || box.shape === 'rounded') {
                const rx = box.shape === 'rounded' ? 10 : 0;
                svg += `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${rx}" fill="${box.color}" stroke="#2c3e50" stroke-width="2"/>`;
            } else if (box.shape === 'ellipse') {
                svg += `<ellipse cx="${box.x + box.width/2}" cy="${box.y + box.height/2}" rx="${box.width/2}" ry="${box.height/2}" fill="${box.color}" stroke="#2c3e50" stroke-width="2"/>`;
            } else if (box.shape === 'diamond') {
                const points = `${box.x + box.width/2},${box.y} ${box.x + box.width},${box.y + box.height/2} ${box.x + box.width/2},${box.y + box.height} ${box.x},${box.y + box.height/2}`;
                svg += `<polygon points="${points}" fill="${box.color}" stroke="#2c3e50" stroke-width="2"/>`;
            }

            svg += `<text x="${box.x + box.width/2}" y="${box.y + box.height/2}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="14">${box.text}</text>`;
        });

        svg += '</svg>';

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `flowchart-${Date.now()}.svg`;
        a.click();

        URL.revokeObjectURL(url);
    }

    exportPPTX() {
        if (typeof PptxGenJS === 'undefined') {
            alert('PowerPoint export library not loaded');
            return;
        }

        const pptx = new PptxGenJS();
        const slide = pptx.addSlide();

        // Add boxes
        this.boxes.forEach(box => {
            const x = (box.x / this.canvas.width) * 10;
            const y = (box.y / this.canvas.height) * 7.5;
            const w = (box.width / this.canvas.width) * 10;
            const h = (box.height / this.canvas.height) * 7.5;

            let shape = 'rect';
            if (box.shape === 'rounded') shape = 'roundRect';
            else if (box.shape === 'ellipse') shape = 'ellipse';
            else if (box.shape === 'diamond') shape = 'diamond';

            slide.addShape(shape, {
                x: x,
                y: y,
                w: w,
                h: h,
                fill: { color: box.color.substring(1) },
                line: { color: '2c3e50', width: 2 }
            });

            slide.addText(box.text, {
                x: x,
                y: y,
                w: w,
                h: h,
                align: 'center',
                valign: 'middle',
                color: 'FFFFFF',
                fontSize: 14
            });
        });

        // Add connectors
        this.connectors.forEach(connector => {
            const fromBox = this.boxes.find(b => b.id === connector.from);
            const toBox = this.boxes.find(b => b.id === connector.to);

            if (!fromBox || !toBox) return;

            const points = this.getBoxConnectionPoint(fromBox, toBox);

            const x1 = (points.from.x / this.canvas.width) * 10;
            const y1 = (points.from.y / this.canvas.height) * 7.5;
            const x2 = (points.to.x / this.canvas.width) * 10;
            const y2 = (points.to.y / this.canvas.height) * 7.5;

            slide.addShape('line', {
                x: x1,
                y: y1,
                w: x2 - x1,
                h: y2 - y1,
                line: { color: '2c3e50', width: 2, endArrowType: 'arrow' }
            });
        });

        pptx.writeFile({ fileName: `flowchart-${Date.now()}.pptx` });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlowchartApp();
});
