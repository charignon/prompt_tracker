        // Variables set in inline script: prompts, currentPrompt, currentDate
        let currentProjectFilter = '';
        let selectionMode = false;
        let selectedPrompts = new Set();
        let brush;
        let theaterSvg, theaterG, theaterContentGroup;
        let animationRunning = false;
        let theaterPrompts = [];  // Prompts being shown in theater mode
        let theaterCurrentIndex = 0;  // Current prompt index in theater mode
        let theaterDuration = 120000;  // Duration for theater animation (default 2 minutes)
        let autoRerankTimeout = null;  // Timeout for auto-rerank after inactivity

        // D3 visualization variables
        let svg, g, contentGroup, xScale, yScale, zoom, xAxis, drag, rangeWidth;
        const margin = {top: 50, right: 40, bottom: 60, left: 150};

        // ===== VIEWPORT STATE MANAGER - Single Source of Truth =====
        const ViewportState = {
            transform: null,
            scrollTop: 0,
            savedState: null,

            save() {
                if (!svg) return;
                const container = document.getElementById('timeline-scroll-container');
                this.savedState = {
                    transform: d3.zoomTransform(svg.node()),
                    scrollTop: container ? container.scrollTop : 0
                };
            },

            restore() {
                if (!this.savedState || !svg) return;
                const container = document.getElementById('timeline-scroll-container');

                // Apply transform without triggering events
                svg.node().__zoom = this.savedState.transform;
                if (container) {
                    container.scrollTop = this.savedState.scrollTop;
                }

                // Update visualization with new transform
                zoomed({ transform: this.savedState.transform });
            },

            get() {
                if (!svg) return null;
                const container = document.getElementById('timeline-scroll-container');
                return {
                    transform: d3.zoomTransform(svg.node()),
                    scrollTop: container ? container.scrollTop : 0
                };
            }
        };

        // ===== MODE MANAGER - Controls Interaction Modes =====
        const MODES = {
            NORMAL: 'normal',
            SELECTION: 'selection',
            THEATER: 'theater',
            CRAWL: 'crawl'
        };

        let currentMode = MODES.NORMAL;

        function setMode(newMode) {
            if (currentMode === newMode) return;

            // Exit current mode
            switch(currentMode) {
                case MODES.SELECTION:
                    disableBrushMode();
                    break;
                case MODES.THEATER:
                case MODES.CRAWL:
                    // Theater/crawl cleanup handled by their own functions
                    break;
            }

            currentMode = newMode;

            // Enter new mode
            switch(newMode) {
                case MODES.NORMAL:
                    enableNormalMode();
                    break;
                case MODES.SELECTION:
                    enableBrushMode();
                    break;
                case MODES.THEATER:
                case MODES.CRAWL:
                    // Theater/crawl setup handled by their own functions
                    break;
            }

            // DON'T save/restore viewport on mode change - just freeze it!
            // Viewport only changes when user explicitly pans/zooms
        }

        function enableNormalMode() {
            // Normal mode is the default - zoom/pan enabled
            // Nothing special to do, zoom is always active unless we disable it
        }

        function enableBrushMode() {
            if (!svg || !contentGroup) return;

            const container = document.getElementById('timeline-scroll-container');
            const width = container.clientWidth;
            const height = container.clientHeight;
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;

            brush = d3.brush()
                .extent([[0, 0], [innerWidth, innerHeight]])
                .on('end', brushEnded);

            contentGroup.append('g')
                .attr('class', 'brush')
                .call(brush);

            // Disable zoom and drag by removing event listeners
            svg.on('.zoom', null);
            svg.on('.drag', null);
        }

        function disableBrushMode() {
            if (!contentGroup) return;

            contentGroup.select('.brush').remove();
            brush = null;

            // Re-enable zoom and drag by re-calling the behaviors
            if (zoom) {
                svg.call(zoom);  // Re-enable zoom behavior
            }
            if (drag) {
                svg.call(drag);  // Re-enable drag behavior
            }
        }

        // All prompts loaded at once - no lazy loading

        // Group prompts by project
        const projectGroups = {};
        const projectColors = {};
        const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

        prompts.forEach(p => {
            const project = p.project || 'unknown';
            if (!projectGroups[project]) {
                projectGroups[project] = [];
                projectColors[project] = colorScale(project);
            }
            projectGroups[project].push(p);
        });

        const allProjects = Object.keys(projectGroups).sort();

        // Show all projects (no automatic filtering)
        const projectCounts = allProjects.map(project => ({
            project: project,
            count: projectGroups[project].length
        }));
        projectCounts.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.project.localeCompare(b.project);
        });

        // Show all projects ordered by prompt count (most to least)
        let projects = projectCounts.map(pc => pc.project);
        let isFiltered = false;
        let isSortedByCount = true; // Track current sort mode
        let manualSortEnabled = false; // Disable auto-rerank when user manually sorts
        let maxVisibleProjects = 999; // Max projects to show in viewport

        // Populate project filter
        const projectFilter = document.getElementById('project-filter');

        function populateProjectFilter() {
            projectFilter.innerHTML = '<option value="">All Projects</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                const shortName = project.split('/').pop() || project;
                option.textContent = shortName;
                option.title = project; // Show full path on hover
                projectFilter.appendChild(option);
            });
        }

        populateProjectFilter();

        function initTimeline(skipInitialTransform = false) {
            const container = document.getElementById('timeline-scroll-container');
            const width = container.clientWidth;
            const height = container.clientHeight;

            // Calculate dimensions first to get virtualHeight
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;

            const visibleProjects = currentProjectFilter ?
                [currentProjectFilter] : projects.slice(0, maxVisibleProjects);

            // Dynamic spacing: use full viewport height, with minimum spacing for many projects
            const minProjectHeight = 35; // Minimum height for 15 projects
            const maxProjectHeight = innerHeight / Math.max(1, visibleProjects.length); // Fill viewport
            const projectHeight = Math.max(minProjectHeight, maxProjectHeight);
            const virtualHeight = visibleProjects.length * projectHeight;

            // Set SVG to virtual height to enable scrolling
            const svgHeight = Math.max(virtualHeight + margin.top + margin.bottom, height);

            svg = d3.select('#timeline-svg')
                .attr('width', width)
                .attr('height', svgHeight);

            // Clear any existing content
            svg.selectAll('*').remove();

            // Create main group with margins
            g = svg.append('g')
                .attr('transform', `translate(${margin.left},${margin.top})`);

            // Create clip path and mask inside g (same coordinate space as contentGroup)
            // Start at y=15 to exclude the axis area and prevent dots from overlapping
            const defs = g.append('defs');

            defs.append('clipPath')
                .attr('id', 'timeline-clip')
                .append('rect')
                .attr('x', 0)
                .attr('y', 15)  // Start below axis area where first track begins
                .attr('width', innerWidth)
                .attr('height', virtualHeight);

            // Also create a mask for better enforcement during transforms
            defs.append('mask')
                .attr('id', 'timeline-mask')
                .append('rect')
                .attr('x', 0)
                .attr('y', 15)
                .attr('width', innerWidth)
                .attr('height', virtualHeight)
                .attr('fill', 'white');

            // Mike Bostock nested group pattern for proper clipping with transforms
            // Outer group has clipping (in screen space)
            const clipGroup = g.append('g')
                .attr('clip-path', 'url(#timeline-clip)');

            // Inner group gets transforms (pan/zoom)
            // This ensures clipping happens AFTER transform in the rendering pipeline
            contentGroup = clipGroup.append('g')
                .attr('class', 'transform-group');

            // Time scale (X axis) - domain covers all prompts for infinite panning
            const [year, month, day] = currentDate.split('-').map(Number);
            const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);

            // Calculate domain from all prompts data
            let minTime, maxTime;
            if (prompts.length > 0) {
                const timestamps = prompts.map(p => p.timestamp);
                minTime = new Date(Math.min(...timestamps));
                maxTime = new Date(Math.max(...timestamps));
                // Add 1 day buffer on each side
                minTime = new Date(minTime.getTime() - (24 * 60 * 60 * 1000));
                maxTime = new Date(maxTime.getTime() + (24 * 60 * 60 * 1000));
            } else {
                // Fallback if no prompts
                minTime = new Date(dayStart.getTime() - (7 * 24 * 60 * 60 * 1000));
                maxTime = new Date(dayStart.getTime() + (1 * 24 * 60 * 60 * 1000));
            }

            // Calculate range width based on time span
            const timeSpan = maxTime.getTime() - minTime.getTime();
            const daySpan = timeSpan / (24 * 60 * 60 * 1000);
            rangeWidth = innerWidth * Math.max(2, daySpan / 3); // At least 2x screen width

            xScale = d3.scaleTime()
                .domain([minTime, maxTime])
                .range([0, rangeWidth]);

            // Update clip path and mask width to match the full range width
            g.select('#timeline-clip rect')
                .attr('width', rangeWidth)
                .attr('height', virtualHeight);
            g.select('#timeline-mask rect')
                .attr('width', rangeWidth)
                .attr('height', virtualHeight);

            // Set initial transform to show from 11pm previous day to appropriate end time
            const prevDay = new Date(dayStart.getTime() - (24 * 60 * 60 * 1000)); // Previous day midnight
            const viewStart = new Date(prevDay.getTime() + (23 * 60 * 60 * 1000)); // 11pm previous day

            // Special case: if viewing today, show up to 1 hour past current time instead of 1am tomorrow
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const isToday = dayStart.getTime() === today.getTime();

            let viewEnd;
            if (isToday) {
                // Show up to 1 hour past current time
                viewEnd = new Date(now.getTime() + (60 * 60 * 1000));
            } else {
                // Show up to 1am next day (26 hour window)
                viewEnd = new Date(dayStart.getTime() + (25 * 60 * 60 * 1000));
            }

            // DEBUG: Log initial viewport calculation
            console.log('=== INITIAL VIEWPORT DEBUG ===');
            console.log('currentDate:', currentDate);
            console.log('dayStart:', dayStart);
            console.log('isToday:', isToday);
            console.log('viewStart (11pm prev day):', viewStart);
            console.log('viewEnd:', viewEnd);
            console.log('xScale domain:', xScale.domain());
            console.log('xScale range:', xScale.range());

            // Calculate scale to fit 26 hours in viewport
            const viewDuration = viewEnd.getTime() - viewStart.getTime(); // 26 hours in ms
            const viewStartX = xScale(viewStart);
            const viewEndX = xScale(viewEnd);
            const viewWidthInScale = viewEndX - viewStartX;
            const initialScale = innerWidth / viewWidthInScale; // Scale to fit 26 hours
            const initialX = -viewStartX * initialScale; // Translate to show viewStart at left edge

            console.log('innerWidth:', innerWidth);
            console.log('viewStartX:', viewStartX);
            console.log('viewEndX:', viewEndX);
            console.log('viewWidthInScale:', viewWidthInScale);
            console.log('initialScale:', initialScale);
            console.log('initialX:', initialX);
            console.log('Expected viewport end:', (viewEndX * initialScale) + initialX);
            console.log('=== END DEBUG ===');

            // Project scale (Y axis) - start at maxDotRadius + buffer to prevent clipping
            const maxDotRadius = 20; // From radiusScale range
            yScale = d3.scaleBand()
                .domain(visibleProjects)
                .range([maxDotRadius + 10, virtualHeight])  // Start at 30px (20px max radius + 10px buffer)
                .padding(0.3);

            // State for smooth trackpad interaction
            let currentTransform = d3.zoomIdentity;

            // Add zoom behavior for pinch-to-zoom and Ctrl+horizontal panning
            zoom = d3.zoom()
                .scaleExtent([0.5, 100])
                .filter(function(event) {
                    if (event.type === 'wheel') {
                        // Allow wheel events for zoom and panning
                        return true;
                    }
                    // Allow programmatic zoom
                    return !event.sourceEvent;
                })
                .wheelDelta(function(event) {
                    // Custom wheel delta to handle Ctrl+horizontal scroll as panning
                    if (event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                        // Ctrl+horizontal scroll: pan only, no zoom
                        // Return 0 for scale to prevent zooming
                        return 0;
                    }
                    // Default zoom behavior - 6x faster for better responsiveness
                    return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * 6;
                })
                .on('zoom', function(event) {
                    // Handle Ctrl+horizontal scroll as panning
                    if (event.sourceEvent && event.sourceEvent.type === 'wheel' &&
                        event.sourceEvent.ctrlKey && Math.abs(event.sourceEvent.deltaX) > Math.abs(event.sourceEvent.deltaY)) {
                        // Manual pan from horizontal deltaX
                        const panAmount = -event.sourceEvent.deltaX * 2; // Scale for smooth panning
                        currentTransform = d3.zoomIdentity
                            .translate(currentTransform.x + panAmount, 0)
                            .scale(currentTransform.k);
                    } else {
                        // Normal zoom/pan behavior
                        currentTransform = d3.zoomIdentity
                            .translate(event.transform.x, 0)
                            .scale(event.transform.k);
                    }
                    zoomed({ transform: currentTransform });
                });

            // Add drag behavior for panning - works great with trackpad!
            drag = d3.drag()
                .filter(function(event) {
                    // Allow all mouse/touch drag events
                    return !event.ctrlKey && event.button !== 2;
                })
                .on('start', function(event) {
                    // Store starting position
                    const container = document.getElementById('timeline-scroll-container');
                    this.dragStart = {
                        x: event.x,
                        y: event.y,
                        transformX: currentTransform.x,
                        scrollTop: container.scrollTop
                    };
                })
                .on('drag', function(event) {
                    if (!this.dragStart) return;

                    // Calculate horizontal pan amount
                    const dx = event.x - this.dragStart.x;
                    const newX = this.dragStart.transformX + dx;

                    // Apply constraints for horizontal
                    const maxPan = innerWidth * 0.1;
                    const contentWidth = innerWidth * currentTransform.k;
                    const minPan = innerWidth - contentWidth - (innerWidth * 0.1);
                    const constrainedX = Math.max(minPan, Math.min(maxPan, newX));

                    currentTransform = d3.zoomIdentity
                        .translate(constrainedX, 0)
                        .scale(currentTransform.k);

                    // Apply transform immediately
                    zoomed({ transform: currentTransform });

                    // Calculate vertical scroll amount
                    const dy = event.y - this.dragStart.y;
                    const container = document.getElementById('timeline-scroll-container');
                    container.scrollTop = this.dragStart.scrollTop - dy;
                })
                .on('end', function(event) {
                    delete this.dragStart;
                });

            // Apply zoom and drag
            svg.call(zoom);
            svg.call(drag);

            // If we skipped initial transform, the caller will restore the saved transform
            // Do nothing here to avoid triggering zoom events

            // Add grid lines for all hours in the wide domain (inside clipped area)
            const gridGroup = contentGroup.append('g')
                .attr('class', 'grid');

            // Create grid lines for entire time domain
            const gridStartDate = new Date(minTime);
            const gridEndDate = new Date(maxTime);

            // Generate hourly grid lines for entire range
            let currentGridDate = new Date(gridStartDate);
            currentGridDate.setMinutes(0, 0, 0); // Start at hour boundary

            while (currentGridDate <= gridEndDate) {
                const isToday = currentGridDate.toDateString() === new Date(year, month - 1, day).toDateString();
                const isMidnight = currentGridDate.getHours() === 0;

                gridGroup.append('line')
                    .attr('data-timestamp', currentGridDate.getTime())
                    .attr('x1', xScale(currentGridDate))
                    .attr('x2', xScale(currentGridDate))
                    .attr('y1', 0)
                    .attr('y2', virtualHeight)
                    .attr('stroke', isMidnight ? '#ffffff' : '#2a2a2a')
                    .attr('stroke-opacity', isMidnight ? 0.5 : (isToday ? 0.3 : 0.2))
                    .attr('stroke-width', isMidnight ? 4 : 1)
                    .attr('stroke-dasharray', isMidnight ? '10,5' : null);

                currentGridDate.setHours(currentGridDate.getHours() + 1);
            }

            // Add "now" line (current time indicator) inside clipped area - RED
            // Reuse 'now' variable from viewport calculation above
            const nowLine = contentGroup.append('line')
                .attr('class', 'now-line')
                .attr('x1', xScale(now))
                .attr('x2', xScale(now))
                .attr('y1', 0)
                .attr('y2', virtualHeight)
                .attr('stroke', '#ff4444')
                .attr('stroke-width', 2)
                .attr('stroke-opacity', 0.8)
                .attr('stroke-dasharray', '5,5');

            // Add X axis with time ticks at top (outside clipped area)
            xAxis = g.append('g')
                .attr('class', 'axis')
                .attr('transform', `translate(0,0)`)
                .call(d3.axisTop(xScale)
                    .ticks(d3.timeHour.every(2))
                    .tickFormat(d3.timeFormat('%H:%M')));

            // Add project tracks (inside clipped area)
            const trackLines = contentGroup.selectAll('.track-line')
                .data(visibleProjects, d => d);

            trackLines.exit().remove();

            trackLines.enter()
                .append('line')
                .attr('class', 'track-line')
                .attr('stroke', d => projectColors[d])
                .attr('stroke-opacity', 0.3)
                .merge(trackLines)
                .attr('x1', 0)
                .attr('x2', innerWidth)
                .attr('y1', d => yScale(d) + yScale.bandwidth() / 2)
                .attr('y2', d => yScale(d) + yScale.bandwidth() / 2);

            // Project labels using D3 data join
            const labelWidth = 140;
            const labelHeight = yScale.bandwidth();

            const labels = g.selectAll('foreignObject.project-label')
                .data(visibleProjects, d => d);

            labels.exit().remove();

            const labelsEnter = labels.enter()
                .append('foreignObject')
                .attr('class', 'project-label')
                .attr('x', -labelWidth - 5)
                .attr('width', labelWidth)
                .attr('height', labelHeight);

            labelsEnter.append('xhtml:div')
                .style('color', '#888')
                .style('font-size', '11px')
                .style('text-align', 'right')
                .style('padding-right', '5px')
                .style('white-space', 'nowrap')
                .style('overflow', 'hidden')
                .style('text-overflow', 'ellipsis')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('justify-content', 'flex-end')
                .style('height', '100%')
                .text(d => d.split('/').pop() || d)
                .attr('title', d => d);

            labels.merge(labelsEnter)
                .attr('y', d => yScale(d) + yScale.bandwidth() / 2 - labelHeight / 2);

            // Add prompts
            renderPrompts();
            updateZoomDisplay();
            updateHiddenProjectsBadge();

            // Set initial position to show 26-hour window (11pm yesterday to 1am today)
            // Only apply if not skipping (i.e., on first load, not when reordering)
            if (!skipInitialTransform) {
                svg.call(zoom.transform, d3.zoomIdentity.translate(initialX, 0).scale(initialScale));
            }
        }

        function renderPrompts() {
            const visibleProjects = currentProjectFilter ?
                [currentProjectFilter] : projects.slice(0, maxVisibleProjects);

            const visiblePrompts = prompts.filter(p => {
                const project = p.project || 'unknown';
                return visibleProjects.includes(project);
            });

            // Calculate dot radius based on prompt length
            const maxLength = d3.max(visiblePrompts, d => d.display.length) || 1000;
            const radiusScale = d3.scaleSqrt()
                .domain([0, maxLength])
                .range([4, 20]);

            const dots = contentGroup.selectAll('.prompt-dot')
                .data(visiblePrompts, d => d.id);

            // Remove old dots
            dots.exit()
                .transition()
                .duration(300)
                .attr('r', 0)
                .remove();

            // Update existing dots
            dots.transition()
                .duration(300)
                .attr('cx', d => xScale(new Date(d.timestamp)))
                .attr('cy', d => {
                    const project = d.project || 'unknown';
                    const y = yScale(project);
                    if (y === undefined) {
                        console.error('yScale returned undefined for project:', project, 'Available projects:', yScale.domain());
                        return 0;
                    }
                    return y + yScale.bandwidth() / 2;
                })
                .attr('r', d => radiusScale(d.display.length));

            // Add new dots
            const newDots = dots.enter()
                .append('circle')
                .attr('class', d => {
                    let classes = 'prompt-dot';
                    if (d.rating === null) {
                        classes += ' unrated';
                    } else {
                        classes += ` rating-${d.rating}`;
                    }
                    return classes;
                })
                .attr('cx', d => xScale(new Date(d.timestamp)))
                .attr('cy', d => {
                    const project = d.project || 'unknown';
                    const y = yScale(project);
                    if (y === undefined) {
                        console.error('yScale returned undefined for project:', project, 'Available projects:', yScale.domain());
                        return 0;
                    }
                    return y + yScale.bandwidth() / 2;
                })
                .attr('r', 0)
                .style('opacity', 0.8)
                .on('mouseover', showTooltip)
                .on('mouseout', hideTooltip)
                .on('click', function(event, d) {
                    // Don't open panel if in selection mode
                    if (!selectionMode) {
                        showPromptInTheater(d);
                    }
                });

            newDots.transition()
                .duration(300)
                .attr('r', d => radiusScale(d.display.length));
        }

        function zoomed(event) {
            // Back to updating positions - transform approach causes distortion
            const transform = d3.zoomIdentity
                .translate(event.transform.x, 0)
                .scale(event.transform.k);

            const newXScale = transform.rescaleX(xScale);
            const zoomLevel = transform.k;

            // Adaptive tick interval and format based on zoom level
            let tickInterval, tickFormat;
            if (zoomLevel < 1) {
                // Zoomed out: 4-hour intervals
                tickInterval = d3.timeHour.every(4);
                tickFormat = d3.timeFormat('%H:%M');
            } else if (zoomLevel < 2) {
                // Normal view: 2-hour intervals
                tickInterval = d3.timeHour.every(2);
                tickFormat = d3.timeFormat('%H:%M');
            } else if (zoomLevel < 5) {
                // Zoomed in: hourly
                tickInterval = d3.timeHour.every(1);
                tickFormat = d3.timeFormat('%H:%M');
            } else if (zoomLevel < 15) {
                // More zoomed: 30-minute intervals
                tickInterval = d3.timeMinute.every(30);
                tickFormat = d3.timeFormat('%H:%M');
            } else if (zoomLevel < 40) {
                // Very zoomed: 10-minute intervals
                tickInterval = d3.timeMinute.every(10);
                tickFormat = d3.timeFormat('%H:%M');
            } else {
                // Extremely zoomed: 5-minute intervals with seconds
                tickInterval = d3.timeMinute.every(5);
                tickFormat = d3.timeFormat('%H:%M:%S');
            }

            // Update axis with adaptive ticks
            xAxis.call(d3.axisTop(newXScale)
                .ticks(tickInterval)
                .tickFormat(tickFormat));

            // Back to updating individual positions to avoid distortion
            // But keep the nested group structure for better clipping
            const container = document.getElementById('timeline-scroll-container');
            const viewportWidth = container.clientWidth - margin.left - margin.right;

            contentGroup.selectAll('.prompt-dot')
                .attr('cx', d => newXScale(new Date(d.timestamp)))
                .attr('opacity', function(d) {
                    const cx = newXScale(new Date(d.timestamp));
                    // Full opacity if in viewport, faded if outside
                    if (cx >= 0 && cx <= viewportWidth) {
                        return 1;
                    } else {
                        return 0.15;
                    }
                });

            // Update now line X position
            const now = new Date();
            contentGroup.selectAll('.now-line')
                .attr('x1', newXScale(now))
                .attr('x2', newXScale(now));

            // Update grid lines X position using stored timestamps
            contentGroup.selectAll('.grid line')
                .attr('x1', function() {
                    const timestamp = parseInt(d3.select(this).attr('data-timestamp'));
                    return newXScale(new Date(timestamp));
                })
                .attr('x2', function() {
                    const timestamp = parseInt(d3.select(this).attr('data-timestamp'));
                    return newXScale(new Date(timestamp));
                });

            // Update track lines to span the full range width
            contentGroup.selectAll('.track-line')
                .attr('x1', 0)
                .attr('x2', rangeWidth);

            // Update zoom display
            const zoomPercent = Math.round(zoomLevel * 100);
            document.getElementById('zoom-level-display').textContent = zoomPercent + '%';

            // Update visible range display - compact format on one line
            // Calculate what's actually visible in the viewport (0 to innerWidth)
            // Reuse viewportWidth from above
            const startDate = newXScale.invert(0);
            const endDate = newXScale.invert(viewportWidth);

            // Format: "Oct 1 05:57 → Oct 9 20:50" - compact, always one line
            const formatCompact = (date) => {
                const month = date.toLocaleDateString('en-US', { month: 'short' });
                const day = date.getDate();
                const hours = String(date.getHours()).padStart(2, '0');
                const mins = String(date.getMinutes()).padStart(2, '0');
                return `${month} ${day} ${hours}:${mins}`;
            };

            const rangeText = `${formatCompact(startDate)} → ${formatCompact(endDate)}`;
            document.getElementById('visible-range-display').textContent = rangeText;

            // Update project count badge
            const visibleStartTs = startDate.getTime();
            const visibleEndTs = endDate.getTime();
            const visiblePrompts = prompts.filter(p => p.timestamp >= visibleStartTs && p.timestamp <= visibleEndTs);
            const projectsWithData = new Set(visiblePrompts.map(p => p.project || 'unknown'));
            const projectCount = projectsWithData.size;

            const badge = document.getElementById('project-count-badge');
            badge.textContent = projectCount;

            // Color based on thresholds
            if (projectCount < 12) {
                badge.style.background = '#27ae60'; // green
            } else if (projectCount <= 16) {
                badge.style.background = '#f39c12'; // orange
            } else {
                badge.style.background = '#e74c3c'; // red
            }

            // Auto-rerank after 500ms of inactivity (but not in selection mode or manual sort mode)
            if (autoRerankTimeout) {
                clearTimeout(autoRerankTimeout);
            }
            if (!selectionMode && !manualSortEnabled) {
                autoRerankTimeout = setTimeout(() => {
                    // Skip auto-rerank if manual sort is enabled
                    if (manualSortEnabled) return;

                    // Check if rerank would actually change anything
                    const currentVisibleStartTs = startDate.getTime();
                    const currentVisibleEndTs = endDate.getTime();
                    const currentVisiblePrompts = prompts.filter(p => p.timestamp >= currentVisibleStartTs && p.timestamp <= currentVisibleEndTs);

                    // Group by project
                    const currentProjectGroups = {};
                    currentVisiblePrompts.forEach(prompt => {
                        const project = prompt.project || 'unknown';
                        if (!currentProjectGroups[project]) {
                            currentProjectGroups[project] = [];
                        }
                        currentProjectGroups[project].push(prompt);
                    });

                    // Get new order
                    const newProjectCounts = Object.keys(currentProjectGroups).map(project => ({
                        project: project,
                        count: currentProjectGroups[project].length
                    }));
                    newProjectCounts.sort((a, b) => {
                        if (b.count !== a.count) return b.count - a.count;
                        return a.project.localeCompare(b.project);
                    });
                    const newOrder = newProjectCounts.map(pc => pc.project);

                    // Check if order changed
                    const currentOrder = projects.slice(0, newOrder.length);
                    const orderChanged = newOrder.length !== currentOrder.length ||
                        newOrder.some((p, i) => p !== currentOrder[i]);

                    if (orderChanged) {
                        // Don't call refreshTimeline - that's for manual sorting!
                        // Use smart reranking to minimize disruption

                        // Smart reranking: Preserve positions to minimize disruption
                        const topN = Math.min(maxVisibleProjects, newOrder.length);
                        const newTopNSet = new Set(newOrder.slice(0, topN));
                        const prevTopNSet = new Set(projects.slice(0, topN));

                        // Build new order: preserve positions of projects still in top N
                        const result = [];
                        const used = new Set();

                        // First pass: keep projects in their original position if still in top N
                        for (let i = 0; i < topN; i++) {
                            const prevProject = projects[i];
                            if (prevProject && newTopNSet.has(prevProject)) {
                                result[i] = prevProject;
                                used.add(prevProject);
                            }
                        }

                        // Second pass: fill empty slots with new projects (sorted by count)
                        let sortedIndex = 0;
                        for (let i = 0; i < topN; i++) {
                            if (!result[i]) {
                                // Find next unused project from sorted list
                                while (sortedIndex < newOrder.length && used.has(newOrder[sortedIndex])) {
                                    sortedIndex++;
                                }
                                if (sortedIndex < newOrder.length) {
                                    result[i] = newOrder[sortedIndex];
                                    used.add(newOrder[sortedIndex]);
                                    sortedIndex++;
                                }
                            }
                        }

                        // Append remaining projects
                        const remainingProjects = projects.filter(p => !used.has(p));
                        projects = [...result.filter(p => p), ...remainingProjects];

                        // Trigger a redraw without transitions
                        updateProjectPositions();
                    }
                }, 500);
            }
        }

        function zoomIn() {
            svg.transition()
                .duration(300)
                .call(zoom.scaleBy, 1.5);
        }

        function zoomOut() {
            svg.transition()
                .duration(300)
                .call(zoom.scaleBy, 0.67);
        }

        function updateZoomDisplay() {
            const transform = d3.zoomTransform(svg.node());
            const zoomPercent = Math.round(transform.k * 100);
            document.getElementById('zoom-level-display').textContent = zoomPercent + '%';
        }

        function updateHiddenProjectsBadge() {
            // Count total projects with prompts vs displayed projects
            const totalProjects = Object.keys(projectGroups).length;
            const displayedProjects = projects.length;
            const hiddenCount = totalProjects - displayedProjects;

            const badge = document.getElementById('hidden-projects-badge');
            if (!badge) return; // Element doesn't exist in this view

            if (hiddenCount > 0) {
                badge.textContent = `+${hiddenCount}`;
                badge.style.display = 'inline';
                badge.title = `${hiddenCount} more project${hiddenCount > 1 ? 's' : ''} not shown - click Reorder to see them`;
            } else {
                badge.style.display = 'none';
            }
        }

        function setMaxVisibleProjects(max) {
            maxVisibleProjects = max;

            // Save viewport before changes
            ViewportState.save();

            // Reinitialize timeline with new project limit (skip initial transform)
            initTimeline(true);

            // Restore viewport and trigger zoomed to start auto-rerank
            ViewportState.restore();
        }

        function filterByProject(project) {
            // Save viewport before filtering
            ViewportState.save();

            // SAFE VERSION: Don't touch viewport at all
            currentProjectFilter = project;

            // Just update which projects are visible (limited by maxVisibleProjects)
            const visibleProjectsToShow = project ? [project] : projects.slice(0, maxVisibleProjects);

            const container = document.getElementById('timeline-scroll-container');
            const height = container.clientHeight;
            const innerHeight = height - margin.top - margin.bottom;
            const minProjectHeight = 35;
            const maxProjectHeight = innerHeight / Math.max(1, visibleProjectsToShow.length);
            const projectHeight = Math.max(minProjectHeight, maxProjectHeight);

            yScale.domain(visibleProjectsToShow).range([15, visibleProjectsToShow.length * projectHeight]);

            // Update y-axis
            const yAxisGroup = g.select('.y-axis');
            if (yAxisGroup.size() > 0) {
                yAxisGroup.call(d3.axisLeft(yScale));
            }

            // Update dots and track lines positions
            const yScaleDomain = new Set(yScale.domain());
            contentGroup.selectAll('.prompt-dot')
                .style('display', d => {
                    if (project && (d.project || 'unknown') !== project) return 'none';
                    return 'block';
                })
                .filter(d => yScaleDomain.has(d.project || 'unknown'))
                .attr('cy', d => yScale(d.project || 'unknown') + yScale.bandwidth() / 2);

            contentGroup.selectAll('.track-line')
                .style('display', d => {
                    if (project && d !== project) return 'none';
                    return 'block';
                })
                .filter(d => yScaleDomain.has(d))
                .attr('y1', d => yScale(d) + yScale.bandwidth() / 2)
                .attr('y2', d => yScale(d) + yScale.bandwidth() / 2);

            // Restore viewport after filtering
            ViewportState.restore();
        }

        function updateProjectPositions() {
            // Update visual positions after project order changes
            // This is used by both manual sort and auto-rerank
            const container = document.getElementById('timeline-scroll-container');
            const visibleProjectsToShow = currentProjectFilter ? [currentProjectFilter] : projects.slice(0, maxVisibleProjects);
            const width = container.clientWidth;
            const height = container.clientHeight;
            const innerHeight = height - margin.top - margin.bottom;
            const minProjectHeight = 35;
            const maxProjectHeight = innerHeight / Math.max(1, visibleProjectsToShow.length);
            const projectHeight = Math.max(minProjectHeight, maxProjectHeight);

            yScale.domain(visibleProjectsToShow).range([15, visibleProjectsToShow.length * projectHeight]);

            // Update project labels
            const labelWidth = 140;
            const labelHeight = yScale.bandwidth();

            const labels = g.selectAll('foreignObject.project-label')
                .data(visibleProjectsToShow, d => d);

            labels.exit().remove();

            const labelsEnter = labels.enter()
                .append('foreignObject')
                .attr('class', 'project-label')
                .attr('x', -labelWidth - 5)
                .attr('width', labelWidth)
                .attr('height', labelHeight);

            labelsEnter.append('xhtml:div')
                .style('color', '#888')
                .style('font-size', '11px')
                .style('text-align', 'right')
                .style('padding-right', '5px')
                .style('white-space', 'nowrap')
                .style('overflow', 'hidden')
                .style('text-overflow', 'ellipsis')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('justify-content', 'flex-end')
                .style('height', '100%')
                .text(d => d.split('/').pop() || d)
                .attr('title', d => d);

            // Update all labels - no transition for auto-rerank
            labels.merge(labelsEnter)
                .attr('y', d => yScale(d) + yScale.bandwidth() / 2 - labelHeight / 2);

            // Update dots and lines - no transition for auto-rerank
            // Filter to only update elements for projects in yScale domain
            const yScaleDomain = new Set(yScale.domain());
            contentGroup.selectAll('.prompt-dot')
                .filter(d => yScaleDomain.has(d.project || 'unknown'))
                .attr('cy', d => yScale(d.project || 'unknown') + yScale.bandwidth() / 2);

            contentGroup.selectAll('.track-line')
                .filter(d => yScaleDomain.has(d))
                .attr('y1', d => yScale(d) + yScale.bandwidth() / 2)
                .attr('y2', d => yScale(d) + yScale.bandwidth() / 2);
        }

        function refreshTimeline() {
            // Enable manual sort mode - disables auto-rerank
            manualSortEnabled = true;

            // Save viewport before any changes
            ViewportState.save();

            // Get visible time range from current viewport
            const container = document.getElementById('timeline-scroll-container');
            const savedTransform = svg ? d3.zoomTransform(svg.node()) : d3.zoomIdentity;
            const currentXScale = savedTransform.rescaleX(xScale);
            const viewportWidth = container.clientWidth - margin.left - margin.right;
            const visibleStartDate = currentXScale.invert(0);
            const visibleEndDate = currentXScale.invert(viewportWidth);
            const visibleStartTs = visibleStartDate.getTime();
            const visibleEndTs = visibleEndDate.getTime();

            // Filter prompts to visible time range
            const visiblePrompts = prompts.filter(p =>
                p.timestamp >= visibleStartTs && p.timestamp <= visibleEndTs
            );

            // Group visible prompts by project
            const visibleProjectGroups = {};
            visiblePrompts.forEach(prompt => {
                const project = prompt.project || 'unknown';
                if (!visibleProjectGroups[project]) {
                    visibleProjectGroups[project] = [];
                }
                visibleProjectGroups[project].push(prompt);
            });

            // Get list of projects with visible prompts
            const visibleProjects = Object.keys(visibleProjectGroups);

            // Toggle between count-sorted and alphabetical
            isSortedByCount = !isSortedByCount;

            let sortedVisibleProjects;

            if (isSortedByCount) {
                // Sort by count in visible range (most to least)
                const projectCounts = visibleProjects.map(project => ({
                    project: project,
                    count: visibleProjectGroups[project].length
                }));
                projectCounts.sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    return a.project.localeCompare(b.project);
                });
                sortedVisibleProjects = projectCounts.map(pc => pc.project);
            } else {
                // Sort alphabetically
                sortedVisibleProjects = visibleProjects.slice().sort((a, b) => a.localeCompare(b));
            }

            // Rebuild projects list: sorted visible projects + remaining projects
            const invisibleProjects = projects.filter(p => !visibleProjects.includes(p));
            projects = [...sortedVisibleProjects, ...invisibleProjects];

            // Update button text to show next action
            const btn = document.getElementById('reorder-btn');
            const badge = btn.querySelector('#project-count-badge');
            if (isSortedByCount) {
                btn.innerHTML = 'Sort A-Z';
                btn.title = 'Sort projects alphabetically';
            } else {
                btn.innerHTML = 'Sort by Count';
                btn.title = 'Sort projects by total datapoint count (most to least)';
            }
            if (badge) btn.appendChild(badge); // Preserve badge

            // Update project filter dropdown
            populateProjectFilter();

            // DON'T call initTimeline - that breaks everything
            // Instead, just update the y-scale domain and redraw
            const visibleProjectsToShow = currentProjectFilter ? [currentProjectFilter] : projects.slice(0, maxVisibleProjects);
            const width = container.clientWidth;
            const height = container.clientHeight;
            const innerHeight = height - margin.top - margin.bottom;
            const minProjectHeight = 35;
            const maxProjectHeight = innerHeight / Math.max(1, visibleProjectsToShow.length);
            const projectHeight = Math.max(minProjectHeight, maxProjectHeight);

            yScale.domain(visibleProjectsToShow).range([15, visibleProjectsToShow.length * projectHeight]);

            // Update project labels - use CSS transform for better performance
            const labelWidth = 140;
            const labelHeight = yScale.bandwidth();

            const labels = g.selectAll('foreignObject.project-label')
                .data(visibleProjectsToShow, d => d);

            // Remove exiting labels
            labels.exit().remove();

            // Add new labels
            const labelsEnter = labels.enter()
                .append('foreignObject')
                .attr('class', 'project-label')
                .attr('x', -labelWidth - 5)
                .attr('width', labelWidth)
                .attr('height', labelHeight)
                .style('will-change', 'transform'); // Hint browser for GPU acceleration

            labelsEnter.append('xhtml:div')
                .style('color', '#888')
                .style('font-size', '11px')
                .style('text-align', 'right')
                .style('padding-right', '5px')
                .style('white-space', 'nowrap')
                .style('overflow', 'hidden')
                .style('text-overflow', 'ellipsis')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('justify-content', 'flex-end')
                .style('height', '100%')
                .text(d => d.split('/').pop() || d)
                .attr('title', d => d);

            // Update all labels (existing + new) - use attr not style for better performance
            labels.merge(labelsEnter)
                .attr('y', d => yScale(d) + yScale.bandwidth() / 2 - labelHeight / 2)
                .transition()
                .duration(300) // Reduced from 600ms
                .ease(d3.easeQuadOut) // Faster easing
                .attr('y', d => yScale(d) + yScale.bandwidth() / 2 - labelHeight / 2);

            // Update all visual elements with new y positions with smooth transition
            const yScaleDomain = new Set(yScale.domain());
            contentGroup.selectAll('.prompt-dot')
                .filter(d => yScaleDomain.has(d.project || 'unknown'))
                .transition()
                .duration(600)
                .ease(d3.easeCubicInOut)
                .attr('cy', d => yScale(d.project || 'unknown') + yScale.bandwidth() / 2);

            contentGroup.selectAll('.track-line')
                .filter(d => yScaleDomain.has(d))
                .transition()
                .duration(600)
                .ease(d3.easeCubicInOut)
                .attr('y1', d => yScale(d) + yScale.bandwidth() / 2)
                .attr('y2', d => yScale(d) + yScale.bandwidth() / 2);

            // Restore viewport after reordering
            ViewportState.restore();
        }

        function showTooltip(event, d) {
            const tooltip = d3.select('#tooltip');
            const time = new Date(d.timestamp).toLocaleTimeString();
            const preview = d.display.length > 300 ?
                d.display.substring(0, 300) + '...' : d.display;

            tooltip.html(`
                <div class="tooltip-time">${time} • ${d.display.length} chars</div>
                <div class="tooltip-text">${escapeHtml(preview)}</div>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY + 10) + 'px')
            .style('opacity', 1);
        }

        function hideTooltip() {
            d3.select('#tooltip').style('opacity', 0);
        }

        function changeDate(delta) {
            // Parse date as local time to avoid timezone issues
            const [year, month, day] = currentDate.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            date.setDate(date.getDate() + delta);
            const newYear = date.getFullYear();
            const newMonth = String(date.getMonth() + 1).padStart(2, '0');
            const newDay = String(date.getDate()).padStart(2, '0');
            const newDate = `${newYear}-${newMonth}-${newDay}`;
            loadDate(newDate);
        }

        function onDateChange(newDate) {
            loadDate(newDate);
        }

        function loadDate(newDate) {
            currentDate = newDate;
            document.getElementById('date-input').value = newDate;
            alert(`To view ${newDate}, run:\n\nprompt-tracker timeline ${newDate}`);
        }

        function showPanel(event, prompt) {
            currentPrompt = prompt;
            const panel = document.getElementById('side-panel');
            const panelBody = document.getElementById('panel-body');

            const time = new Date(prompt.timestamp).toLocaleString();

            let html = `
                <div class="prompt-id">Prompt #${prompt.id} • ${prompt.display.length} characters</div>
                <div class="prompt-time">${time}</div>
                <div class="rating-selector">
                    ${[1,2,3,4,5].map(rating =>
                        `<span class="rating-star ${prompt.rating >= rating ? 'filled' : 'empty'}"
                               onclick="setRating(${prompt.id}, ${rating})"
                               data-rating="${rating}">★</span>`
                    ).join('')}
                </div>
                <div class="prompt-text">${escapeHtml(prompt.display)}</div>
            `;

            if (prompt.project) {
                html += `<div class="prompt-meta">Project: ${escapeHtml(prompt.project)}</div>`;
            }

            if (prompt.note) {
                html += `<div class="prompt-note"><strong>Note:</strong><br>${escapeHtml(prompt.note)}</div>`;
            }

            panelBody.innerHTML = html;
            panel.classList.add('active');
        }

        function setRating(promptId, rating) {
            const prompt = prompts.find(p => p.id === promptId);
            if (prompt) {
                prompt.rating = rating;

                // Update the dot
                d3.selectAll('.prompt-dot')
                    .filter(d => d.id === promptId)
                    .attr('class', `prompt-dot rating-${rating}`);

                // Update stars in panel
                document.querySelectorAll('.rating-star').forEach((star, index) => {
                    star.className = index < rating ? 'rating-star filled' : 'rating-star empty';
                });

                // Show save status
                const status = document.getElementById('save-status');
                status.classList.add('show');
                setTimeout(() => status.classList.remove('show'), 2000);

                saveRating(promptId, rating);
            }
        }

        function saveRating(promptId, rating) {
            // Save to server
            fetch('/api/rate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    prompt_id: promptId,
                    rating: rating
                })
            }).then(response => {
                if (!response.ok) {
                    console.error('Failed to save rating');
                }
            }).catch(error => {
                console.error('Error saving rating:', error);
            });
        }

        function closePanel() {
            document.getElementById('side-panel').classList.remove('active');
            currentPrompt = null;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function toggleSelection() {
            selectionMode = !selectionMode;
            const btn = document.getElementById('select-btn');

            if (selectionMode) {
                btn.classList.add('active');
                btn.textContent = '✓ Selecting';
                setMode(MODES.SELECTION);
            } else {
                btn.classList.remove('active');
                btn.textContent = '⬚ Select';
                setMode(MODES.NORMAL);
                clearSelection();
            }
        }

        function brushEnded(event) {
            const selection = event.selection;
            if (!selection) return;

            selectedPrompts.clear();

            // Save current transform and scroll position
            const transform = d3.zoomTransform(svg.node());
            const container = document.getElementById('timeline-scroll-container');
            const savedScrollTop = container.scrollTop;
            const newXScale = transform.rescaleX(xScale);

            // Find dots within selection
            contentGroup.selectAll('.prompt-dot').each(function(d) {
                const cx = parseFloat(d3.select(this).attr('cx'));
                const cy = parseFloat(d3.select(this).attr('cy'));

                if (cx >= selection[0][0] && cx <= selection[1][0] &&
                    cy >= selection[0][1] && cy <= selection[1][1]) {
                    selectedPrompts.add(d.id);
                    d3.select(this).classed('selected', true);
                } else {
                    d3.select(this).classed('selected', false);
                }
            });

            // Clear the brush selection rectangle but keep the dots selected
            contentGroup.select('.brush').call(brush.move, null);

            // Don't touch viewport - scroll position is already correct from drag behavior
            updateSelectionUI();
        }

        function clearSelection() {
            selectedPrompts.clear();
            contentGroup.selectAll('.prompt-dot').classed('selected', false);
            updateSelectionUI();
        }

        function updateSelectionUI() {
            const count = selectedPrompts.size;
            const countEl = document.getElementById('selection-count');
            const exportBtn = document.getElementById('export-btn');
            const animateTheaterBtn = document.getElementById('animate-theater-btn');
            const animateCrawlBtn = document.getElementById('animate-crawl-btn');
            const animate10xBtn = document.getElementById('animate-10x-btn');

            if (count > 0) {
                countEl.textContent = `${count} selected`;
                countEl.style.display = 'inline';
                exportBtn.style.display = 'inline-block';
                animateTheaterBtn.style.display = 'inline-block';
                animateCrawlBtn.style.display = 'inline-block';
                animate10xBtn.style.display = 'inline-block';
            } else {
                countEl.style.display = 'none';
                exportBtn.style.display = 'none';
                animateTheaterBtn.style.display = 'none';
                animateCrawlBtn.style.display = 'none';
                animate10xBtn.style.display = 'none';
            }
        }

        function exportSelected() {
            if (selectedPrompts.size === 0) return;

            const selected = prompts.filter(p => selectedPrompts.has(p.id));

            // Sort by timestamp
            selected.sort((a, b) => a.timestamp - b.timestamp);

            // Create CSV
            const headers = ['ID', 'Timestamp', 'Time', 'Project', 'Rating', 'Prompt', 'Note'];
            const rows = [headers];

            selected.forEach(p => {
                const dt = new Date(p.timestamp);
                const timeStr = dt.toLocaleString();
                const rating = p.rating || '';
                const note = (p.note || '').replace(/"/g, '""');
                const prompt = p.display.replace(/"/g, '""');
                const project = (p.project || '').replace(/"/g, '""');

                rows.push([
                    p.id,
                    p.timestamp,
                    timeStr,
                    project,
                    rating,
                    `"${prompt}"`,
                    `"${note}"`
                ]);
            });

            const csv = rows.map(row => row.join(',')).join('\n');

            // Download CSV
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `prompts_${currentDate}_${selectedPrompts.size}_selected.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function animateTheater() {
            if (selectedPrompts.size === 0) return;

            const selected = prompts.filter(p => selectedPrompts.has(p.id));
            selected.sort((a, b) => a.timestamp - b.timestamp);

            if (selected.length === 0) return;

            // Store prompts for navigation
            theaterPrompts = selected;
            theaterCurrentIndex = 0;
            theaterDuration = 120000;  // 2-minute mode

            // Enter theater mode
            const theaterMode = document.getElementById('theater-mode');
            theaterMode.classList.add('active');
            animationRunning = false;  // Don't auto-play

            // Ensure theater mode can receive keyboard events
            theaterMode.setAttribute('tabindex', '0');
            theaterMode.focus();

            // Initialize theater timeline
            initTheaterTimeline(selected);

            // Clear selection highlighting
            contentGroup.selectAll('.prompt-dot').classed('selected', false);

            // Show first prompt without auto-playing
            showTheaterPrompt(0);
        }

        function animate10x() {
            if (selectedPrompts.size === 0) return;

            const selected = prompts.filter(p => selectedPrompts.has(p.id));
            selected.sort((a, b) => a.timestamp - b.timestamp);

            if (selected.length === 0) return;

            // Store prompts for navigation
            theaterPrompts = selected;
            theaterCurrentIndex = 0;

            // Calculate 10x speed duration
            const firstTimestamp = selected[0].timestamp;
            const lastTimestamp = selected[selected.length - 1].timestamp;
            const actualDuration = lastTimestamp - firstTimestamp;
            theaterDuration = actualDuration / 10;

            // Enter theater mode
            const theaterMode = document.getElementById('theater-mode');
            theaterMode.classList.add('active');
            animationRunning = false;  // Don't auto-play

            // Ensure theater mode can receive keyboard events
            theaterMode.setAttribute('tabindex', '0');
            theaterMode.focus();

            // Initialize theater timeline
            initTheaterTimeline(selected);

            // Clear selection highlighting
            contentGroup.selectAll('.prompt-dot').classed('selected', false);

            // Show first prompt without auto-playing
            showTheaterPrompt(0);
        }

        function initTheaterTimeline(selected) {
            const container = document.getElementById('theater-timeline');
            const width = container.clientWidth;
            const height = container.clientHeight;
            const theaterMargin = {top: 20, right: 40, bottom: 40, left: 80};

            // Clear existing
            d3.select('#theater-timeline').selectAll('*').remove();

            theaterSvg = d3.select('#theater-timeline')
                .append('svg')
                .attr('width', width)
                .attr('height', height);

            theaterG = theaterSvg.append('g')
                .attr('transform', `translate(${theaterMargin.left},${theaterMargin.top})`);

            const innerWidth = width - theaterMargin.left - theaterMargin.right;
            const innerHeight = height - theaterMargin.top - theaterMargin.bottom;

            // Add clip path
            theaterSvg.append('defs')
                .append('clipPath')
                .attr('id', 'theater-clip')
                .append('rect')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', innerWidth)
                .attr('height', innerHeight);

            theaterContentGroup = theaterG.append('g')
                .attr('clip-path', 'url(#theater-clip)');

            // Create time scale for selected prompts
            const [year, month, day] = currentDate.split('-').map(Number);
            const firstTime = new Date(selected[0].timestamp);
            const lastTime = new Date(selected[selected.length - 1].timestamp);

            const theaterXScale = d3.scaleTime()
                .domain([firstTime, lastTime])
                .range([0, innerWidth]);

            // Group by project
            const selectedProjects = [...new Set(selected.map(p => p.project || 'unknown'))];
            const theaterYScale = d3.scaleBand()
                .domain(selectedProjects)
                .range([0, innerHeight])
                .padding(0.3);

            // Add project tracks
            selectedProjects.forEach(project => {
                const y = theaterYScale(project) + theaterYScale.bandwidth() / 2;

                theaterContentGroup.append('line')
                    .attr('class', 'track-line')
                    .attr('x1', 0)
                    .attr('x2', innerWidth)
                    .attr('y1', y)
                    .attr('y2', y)
                    .attr('stroke', projectColors[project] || '#666')
                    .attr('stroke-opacity', 0.3);

                const theaterLabel = theaterG.append('text')
                    .attr('class', 'track-label')
                    .attr('x', -10)
                    .attr('y', y)
                    .attr('text-anchor', 'end')
                    .attr('dominant-baseline', 'middle')
                    .style('fill', '#888')
                    .style('font-size', '11px')
                    .text(project.split('/').pop() || project);

                // Add hover tooltip with full path
                theaterLabel.append('title')
                    .text(project);
            });

            // Add axis
            theaterG.append('g')
                .attr('class', 'axis')
                .attr('transform', `translate(0,${innerHeight})`)
                .style('color', '#666')
                .call(d3.axisBottom(theaterXScale)
                    .ticks(5)
                    .tickFormat(d3.timeFormat('%H:%M')));

            // Add dots (initially invisible)
            const maxLength = d3.max(selected, d => d.display.length) || 1000;
            const radiusScale = d3.scaleSqrt()
                .domain([0, maxLength])
                .range([4, 20]);

            theaterContentGroup.selectAll('.theater-dot')
                .data(selected)
                .enter()
                .append('circle')
                .attr('class', 'theater-dot')
                .attr('cx', d => theaterXScale(new Date(d.timestamp)))
                .attr('cy', d => {
                    const project = d.project || 'unknown';
                    return theaterYScale(project) + theaterYScale.bandwidth() / 2;
                })
                .attr('r', d => radiusScale(d.display.length))
                .attr('fill', d => {
                    if (!d.rating) return '#666';
                    if (d.rating <= 2) return '#e74c3c';
                    if (d.rating === 3) return '#f39c12';
                    return '#27ae60';
                })
                .style('opacity', 0);

            return {theaterXScale, theaterYScale, innerWidth, innerHeight};
        }

        function playTheaterAnimation(selected, totalDuration) {
            const firstTimestamp = selected[0].timestamp;
            const lastTimestamp = selected[selected.length - 1].timestamp;
            const actualDuration = lastTimestamp - firstTimestamp;

            let currentIndex = 0;
            const startTime = Date.now();

            const promptDisplay = document.getElementById('theater-prompt');
            const promptTime = document.getElementById('theater-time');
            const promptProject = document.getElementById('theater-project');
            const promptText = document.getElementById('theater-text');
            const progressEl = document.getElementById('theater-progress');

            function animateNext() {
                if (!animationRunning || currentIndex >= selected.length) {
                    // Animation complete
                    promptDisplay.style.opacity = '0';
                    setTimeout(() => {
                        if (animationRunning) {
                            exitTheaterMode();
                        }
                    }, 1000);
                    return;
                }

                const prompt = selected[currentIndex];
                const elapsed = Date.now() - startTime;
                const progress = Math.min(100, (elapsed / totalDuration) * 100);

                // Update progress
                progressEl.textContent = `${currentIndex + 1} / ${selected.length} prompts • ${Math.round(progress)}%`;

                // Show the dot with dramatic effect
                const dot = theaterContentGroup.selectAll('.theater-dot')
                    .filter(d => d.id === prompt.id);

                dot.transition()
                    .duration(200)
                    .style('opacity', 0.3)
                    .transition()
                    .duration(300)
                    .style('opacity', 1)
                    .attr('r', function() {
                        return parseFloat(d3.select(this).attr('r')) * 1.5;
                    })
                    .transition()
                    .duration(400)
                    .attr('r', function() {
                        return parseFloat(d3.select(this).attr('r')) / 1.5;
                    });

                // Display prompt text above timeline
                const time = new Date(prompt.timestamp).toLocaleTimeString();
                promptTime.textContent = time;
                const projectName = prompt.project ? (prompt.project.split('/').pop() || prompt.project) : 'Unknown';
                promptProject.textContent = projectName;
                promptProject.title = prompt.project || 'unknown';
                promptText.textContent = prompt.display;
                promptText.scrollTop = 0; // Reset scroll position

                promptDisplay.style.opacity = '1';

                // Create floating music note effect
                createFloatingNote(dot.node());

                // Calculate delay until next prompt
                currentIndex++;
                if (currentIndex < selected.length) {
                    const nextPrompt = selected[currentIndex];
                    const timeGap = nextPrompt.timestamp - prompt.timestamp;
                    const delay = (timeGap / actualDuration) * totalDuration;
                    setTimeout(animateNext, Math.max(300, delay));
                } else {
                    setTimeout(animateNext, 2000); // Show last prompt for 2 seconds
                }
            }

            animateNext();
        }

        function createFloatingNote(dotElement) {
            if (!dotElement) return;

            const bbox = dotElement.getBoundingClientRect();
            const theaterBox = document.getElementById('theater-timeline').getBoundingClientRect();

            const note = document.createElement('div');
            note.className = 'floating-note';
            note.textContent = '♪';

            // Random color from prompt rating colors
            const colors = ['#e74c3c', '#f39c12', '#27ae60', '#3b82f6'];
            note.style.color = colors[Math.floor(Math.random() * colors.length)];

            note.style.left = bbox.left + 'px';
            note.style.top = bbox.top + 'px';

            document.getElementById('theater-mode').appendChild(note);

            setTimeout(() => note.remove(), 2000);
        }

        function showTheaterPrompt(index) {
            if (index < 0 || index >= theaterPrompts.length) return;

            theaterCurrentIndex = index;
            const prompt = theaterPrompts[index];

            const promptDisplay = document.getElementById('theater-prompt');
            const promptTime = document.getElementById('theater-time');
            const promptProject = document.getElementById('theater-project');
            const promptText = document.getElementById('theater-text');
            const progressEl = document.getElementById('theater-progress');

            // Update display
            const time = new Date(prompt.timestamp).toLocaleTimeString();
            promptTime.textContent = time;
            const projectName = prompt.project ? (prompt.project.split('/').pop() || prompt.project) : 'Unknown';
            promptProject.textContent = projectName;
            promptProject.title = prompt.project || 'unknown';
            promptText.textContent = prompt.display;
            promptText.scrollTop = 0; // Reset scroll position

            // Update progress
            progressEl.textContent = `${index + 1} / ${theaterPrompts.length} prompts`;

            // Update rating buttons
            const ratingButtons = document.querySelectorAll('.theater-rating-btn');
            ratingButtons.forEach((btn, i) => {
                if (prompt.rating && i + 1 === prompt.rating) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Show display
            promptDisplay.style.opacity = '1';

            // Highlight the dot
            theaterContentGroup.selectAll('.theater-dot')
                .style('opacity', d => d.id === prompt.id ? 1 : 0.3)
                .attr('r', d => {
                    const base = radiusScale(d.display.length);
                    return d.id === prompt.id ? base * 1.5 : base;
                });
        }

        function navigateTheaterPrompt(direction) {
            if (theaterPrompts.length === 0) return;

            const newIndex = theaterCurrentIndex + direction;
            if (newIndex >= 0 && newIndex < theaterPrompts.length) {
                showTheaterPrompt(newIndex);
            }
        }

        function rateTheaterPrompt(rating) {
            if (theaterPrompts.length === 0 || theaterCurrentIndex < 0) return;

            const prompt = theaterPrompts[theaterCurrentIndex];

            // Toggle off if clicking the same rating
            if (prompt.rating === rating) {
                rating = null;
            }

            // Update the prompt's rating
            prompt.rating = rating;

            // Find and update the prompt in the main prompts array
            const mainPrompt = prompts.find(p => p.id === prompt.id);
            if (mainPrompt) {
                mainPrompt.rating = rating;
            }

            // Send to server
            fetch('/api/rate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    prompt_id: prompt.id,
                    rating: rating
                })
            });

            // Update rating button highlights
            const ratingButtons = document.querySelectorAll('.theater-rating-btn');
            ratingButtons.forEach((btn, i) => {
                if (rating && i + 1 === rating) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Update the dot color in theater timeline
            theaterContentGroup.selectAll('.theater-dot')
                .filter(d => d.id === prompt.id)
                .attr('fill', () => {
                    if (!rating) return '#666';
                    if (rating <= 2) return '#e74c3c';
                    if (rating === 3) return '#f39c12';
                    return '#27ae60';
                });

            // Update in main timeline too
            contentGroup.selectAll('.prompt-dot')
                .filter(d => d.id === prompt.id)
                .attr('class', d => {
                    const classes = ['prompt-dot'];
                    if (rating) {
                        classes.push(`rating-${rating}`);
                    } else {
                        classes.push('unrated');
                    }
                    return classes.join(' ');
                });
        }

        function toggleTheaterAutoplay() {
            if (theaterPrompts.length === 0) return;

            if (animationRunning) {
                // Stop auto-play
                animationRunning = false;
            } else {
                // Start auto-play from current position
                animationRunning = true;

                // Start from current prompt instead of beginning
                const remainingPrompts = theaterPrompts.slice(theaterCurrentIndex);
                const firstTimestamp = theaterPrompts[theaterCurrentIndex].timestamp;
                const lastTimestamp = theaterPrompts[theaterPrompts.length - 1].timestamp;
                const remainingTime = lastTimestamp - firstTimestamp;

                // Adjust duration proportionally
                const adjustedDuration = (remainingTime / (theaterPrompts[theaterPrompts.length - 1].timestamp - theaterPrompts[0].timestamp)) * theaterDuration;

                playTheaterAnimationFrom(theaterCurrentIndex, adjustedDuration);
            }
        }

        function playTheaterAnimationFrom(startIndex, totalDuration) {
            const selected = theaterPrompts;
            const firstTimestamp = selected[startIndex].timestamp;
            const lastTimestamp = selected[selected.length - 1].timestamp;
            const actualDuration = lastTimestamp - firstTimestamp;

            let currentIndex = startIndex;
            const startTime = Date.now();

            const promptDisplay = document.getElementById('theater-prompt');
            const promptTime = document.getElementById('theater-time');
            const promptProject = document.getElementById('theater-project');
            const promptText = document.getElementById('theater-text');
            const progressEl = document.getElementById('theater-progress');

            function animateNext() {
                if (!animationRunning || currentIndex >= selected.length) {
                    // Animation complete
                    promptDisplay.style.opacity = '0';
                    setTimeout(() => {
                        if (animationRunning) {
                            animationRunning = false;
                        }
                    }, 1000);
                    return;
                }

                const prompt = selected[currentIndex];
                theaterCurrentIndex = currentIndex;
                const elapsed = Date.now() - startTime;
                const progress = Math.min(100, (elapsed / totalDuration) * 100);

                // Update progress
                progressEl.textContent = `${currentIndex + 1} / ${selected.length} prompts • ${Math.round(progress)}%`;

                // Show the dot with dramatic effect
                const dot = theaterContentGroup.selectAll('.theater-dot')
                    .filter(d => d.id === prompt.id);

                dot.transition()
                    .duration(200)
                    .style('opacity', 0.3)
                    .transition()
                    .duration(300)
                    .style('opacity', 1)
                    .attr('r', function() {
                        return parseFloat(d3.select(this).attr('r')) * 1.5;
                    })
                    .transition()
                    .duration(400)
                    .attr('r', function() {
                        return parseFloat(d3.select(this).attr('r')) / 1.5;
                    });

                // Display prompt text above timeline
                const time = new Date(prompt.timestamp).toLocaleTimeString();
                promptTime.textContent = time;
                const projectName = prompt.project ? (prompt.project.split('/').pop() || prompt.project) : 'Unknown';
                promptProject.textContent = projectName;
                promptProject.title = prompt.project || 'unknown';
                promptText.textContent = prompt.display;
                promptText.scrollTop = 0; // Reset scroll position

                // Update rating buttons
                const ratingButtons = document.querySelectorAll('.theater-rating-btn');
                ratingButtons.forEach((btn, i) => {
                    if (prompt.rating && i + 1 === prompt.rating) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                promptDisplay.style.opacity = '1';

                // Highlight current dot
                theaterContentGroup.selectAll('.theater-dot')
                    .style('opacity', d => d.id === prompt.id ? 1 : 0.3)
                    .attr('r', d => {
                        const base = radiusScale(d.display.length);
                        return d.id === prompt.id ? base * 1.5 : base;
                    });

                // Create floating music note effect
                createFloatingNote(dot.node());

                // Calculate delay until next prompt
                currentIndex++;
                if (currentIndex < selected.length) {
                    const nextPrompt = selected[currentIndex];
                    const timeGap = nextPrompt.timestamp - prompt.timestamp;
                    const delay = (timeGap / actualDuration) * totalDuration;
                    setTimeout(animateNext, Math.max(300, delay));
                } else {
                    setTimeout(animateNext, 2000); // Show last prompt for 2 seconds
                }
            }

            animateNext();
        }

        function showPromptInTheater(clickedPrompt) {
            // Sort all prompts by timestamp
            const sortedPrompts = [...prompts].sort((a, b) => a.timestamp - b.timestamp);

            // Find the index of the clicked prompt
            const clickedIndex = sortedPrompts.findIndex(p => p.id === clickedPrompt.id);
            if (clickedIndex === -1) return;

            // Set up theater mode with all prompts
            theaterPrompts = sortedPrompts;
            theaterCurrentIndex = clickedIndex;

            // Enter theater mode
            const theaterMode = document.getElementById('theater-mode');
            theaterMode.classList.add('active');
            animationRunning = true;

            // Ensure theater mode can receive keyboard events
            theaterMode.setAttribute('tabindex', '0');
            theaterMode.focus();

            // Show the clicked prompt
            showTheaterPrompt(clickedIndex);
        }

        function exitTheaterMode() {
            animationRunning = false;
            const theaterMode = document.getElementById('theater-mode');
            theaterMode.classList.remove('active');

            // Return focus to the main document
            theaterMode.blur();

            // Cleanup
            d3.select('#theater-timeline').selectAll('*').remove();

            // Turn off selection mode and return to normal mode
            if (selectionMode) {
                selectionMode = false;
                const btn = document.getElementById('select-btn');
                btn.classList.remove('active');
                btn.textContent = '⬚ Select';
            }

            // Always return to normal mode to re-enable zoom/pan
            setMode(MODES.NORMAL);

            // Restore main timeline
            selectedPrompts.clear();
            contentGroup.selectAll('.prompt-dot').classed('selected', false);

            // Update dots to reflect any rating changes made in theater mode
            contentGroup.selectAll('.prompt-dot')
                .attr('class', d => {
                    const classes = ['prompt-dot'];
                    if (d.rating) {
                        classes.push(`rating-${d.rating}`);
                    } else {
                        classes.push('unrated');
                    }
                    if (selectedPrompts.has(d.id)) {
                        classes.push('selected');
                    }
                    return classes.join(' ');
                });

            updateSelectionUI();
        }

        function animateCrawl() {
            if (selectedPrompts.size === 0) return;

            const selected = prompts.filter(p => selectedPrompts.has(p.id));
            selected.sort((a, b) => a.timestamp - b.timestamp);

            if (selected.length === 0) return;

            // Store for navigation
            window.crawlPrompts = selected;
            window.crawlCurrentIndex = 0;

            // Enter crawl mode
            const crawlMode = document.getElementById('crawl-mode');
            crawlMode.classList.add('active');

            // Ensure crawl mode can receive keyboard events
            crawlMode.setAttribute('tabindex', '0');
            crawlMode.focus();

            // Start starfield
            initStarfield();

            // Build scrollable list
            const crawlText = document.getElementById('crawl-text');
            crawlText.innerHTML = '';

            selected.forEach((prompt, index) => {
                const promptDiv = document.createElement('div');
                promptDiv.className = 'crawl-prompt';
                promptDiv.dataset.index = index;
                promptDiv.dataset.promptId = prompt.id;

                const meta = document.createElement('div');
                meta.className = 'crawl-prompt-meta';
                const time = new Date(prompt.timestamp).toLocaleTimeString('en-US', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
                });
                meta.textContent = time;

                const text = document.createElement('div');
                text.className = 'crawl-prompt-text';
                text.textContent = prompt.display;

                const rating = document.createElement('div');
                rating.className = 'crawl-prompt-rating';
                rating.innerHTML = [1,2,3,4,5].map(r => 
                    `<span class="crawl-rating-star ${prompt.rating >= r ? 'filled' : 'empty'}" 
                           onclick="rateCrawlPrompt(${prompt.id}, ${r})"
                           data-rating="${r}">★</span>`
                ).join('');

                promptDiv.appendChild(meta);
                promptDiv.appendChild(text);
                promptDiv.appendChild(rating);
                
                promptDiv.onclick = function(e) {
                    if (!e.target.classList.contains('crawl-rating-star')) {
                        highlightCrawlPrompt(index);
                    }
                };

                crawlText.appendChild(promptDiv);
            });

            // Clear selection highlighting
            contentGroup.selectAll('.prompt-dot').classed('selected', false);
            updateSelectionUI();

            // Highlight the first prompt by default
            if (window.crawlPrompts && window.crawlPrompts.length > 0) {
                highlightCrawlPrompt(0);
            }

            // Sync highlight with mouse scroll position
            setupCrawlScrollSync();
        }

        let starfieldAnimationId;
        let crawlClockInterval;

        function updateCrawlClock() {
            const clockEl = document.getElementById('crawl-clock');

            function updateTime() {
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                clockEl.textContent = `${hours}:${minutes}:${seconds}`;
            }

            updateTime();
            crawlClockInterval = setInterval(updateTime, 1000);
        }

        // Keep track of observer to clean up on exit
        let crawlIntersectionObserver;
        let suppressCrawlScroll = false;

        function setupCrawlScrollSync() {
            const container = document.querySelector('.crawl-container');
            if (!container) return;

            // Clean up existing observer
            if (crawlIntersectionObserver) {
                crawlIntersectionObserver.disconnect();
            }

            // Use Intersection Observer for efficient scroll detection
            // This avoids expensive getBoundingClientRect() calls
            crawlIntersectionObserver = new IntersectionObserver(
                (entries) => {
                    if (!document.getElementById('crawl-mode').classList.contains('active')) return;

                    // Find the most visible prompt (highest intersection ratio near center)
                    let bestEntry = null;
                    let bestScore = -1;

                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            // Score based on intersection ratio and distance from center
                            // Higher ratio = more visible, closer to 0.5 boundingClientRect.top = closer to center
                            const rect = entry.boundingClientRect;
                            const containerRect = entry.rootBounds;
                            const containerCenter = containerRect.height / 2;
                            const elementCenter = rect.top - containerRect.top + rect.height / 2;
                            const distanceFromCenter = Math.abs(elementCenter - containerCenter);
                            const normalizedDistance = 1 - (distanceFromCenter / containerRect.height);
                            const score = entry.intersectionRatio * normalizedDistance;

                            if (score > bestScore) {
                                bestScore = score;
                                bestEntry = entry;
                            }
                        }
                    });

                    if (bestEntry && !suppressCrawlScroll) {
                        const index = parseInt(bestEntry.target.dataset.index);
                        if (index !== window.crawlCurrentIndex) {
                            suppressCrawlScroll = true;
                            highlightCrawlPrompt(index);
                            suppressCrawlScroll = false;
                        }
                    }
                },
                {
                    root: container,
                    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
                    rootMargin: '-25% 0px -25% 0px' // Focus on center 50% of viewport
                }
            );

            // Observe all prompt elements
            document.querySelectorAll('.crawl-prompt').forEach(el => {
                crawlIntersectionObserver.observe(el);
            });
        }

        function initStarfield() {
            const canvas = document.getElementById('starfield');
            const ctx = canvas.getContext('2d');

            // Set canvas size
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // Create stars
            const stars = [];
            const numStars = 200;

            for (let i = 0; i < numStars; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 1.5,
                    opacity: Math.random(),
                    speed: Math.random() * 0.5 + 0.1
                });
            }

            function animate() {
                if (!animationRunning) return;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                stars.forEach(star => {
                    // Twinkle effect
                    star.opacity += (Math.random() - 0.5) * 0.02;
                    star.opacity = Math.max(0.3, Math.min(1, star.opacity));

                    ctx.beginPath();
                    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
                    ctx.fill();

                    // Slow drift
                    star.y += star.speed;
                    if (star.y > canvas.height) {
                        star.y = 0;
                        star.x = Math.random() * canvas.width;
                    }
                });

                starfieldAnimationId = requestAnimationFrame(animate);
            }

            // Fill canvas with black initially
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            animate();
        }

        function renderCrawlClockFor(index) {
            const clockEl = document.getElementById('crawl-clock');
            if (!window.crawlPrompts || !window.crawlPrompts[index]) {
                clockEl.textContent = '';
                return;
            }
            const t = new Date(window.crawlPrompts[index].timestamp);
            const hours = String(t.getHours()).padStart(2, '0');
            const minutes = String(t.getMinutes()).padStart(2, '0');
            const seconds = String(t.getSeconds()).padStart(2, '0');
            clockEl.textContent = `${hours}:${minutes}:${seconds}`;
        }

        function highlightCrawlPrompt(index) {
            window.crawlCurrentIndex = index;
            document.querySelectorAll('.crawl-prompt').forEach((el, i) => {
                if (i === index) {
                    el.classList.add('highlighted');
                    if (!suppressCrawlScroll) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                } else {
                    el.classList.remove('highlighted');
                }
            });
            // Show the highlighted prompt's time on the clock
            renderCrawlClockFor(index);
        }

        function rateCrawlPrompt(promptId, rating) {
            const prompt = prompts.find(p => p.id === promptId);
            if (!prompt) return;

            // Toggle off if same rating
            if (prompt.rating === rating) {
                rating = null;
            }

            prompt.rating = rating;

            // Update stars in crawl view
            const promptDiv = document.querySelector(`[data-prompt-id="${promptId}"]`);
            if (promptDiv) {
                promptDiv.querySelectorAll('.crawl-rating-star').forEach((star, i) => {
                    star.className = (rating && i < rating) ? 'crawl-rating-star filled' : 'crawl-rating-star empty';
                });
            }

            // Save to localStorage
            const ratings = JSON.parse(localStorage.getItem('prompt_ratings') || '{}');
            if (rating === null) {
                delete ratings[promptId];
            } else {
                ratings[promptId] = rating;
            }
            localStorage.setItem('prompt_ratings', JSON.stringify(ratings));

            // Update main timeline
            contentGroup.selectAll('.prompt-dot')
                .filter(d => d.id === promptId)
                .attr('class', d => {
                    const classes = ['prompt-dot'];
                    if (rating) {
                        classes.push(`rating-${rating}`);
                    } else {
                        classes.push('unrated');
                    }
                    return classes.join(' ');
                });
        }

        function navigateCrawl(direction) {
            if (!window.crawlPrompts || window.crawlPrompts.length === 0) return;
            
            const newIndex = window.crawlCurrentIndex + direction;
            if (newIndex >= 0 && newIndex < window.crawlPrompts.length) {
                highlightCrawlPrompt(newIndex);
            }
        }

        function exitCrawlMode() {
            animationRunning = false;
            const crawlMode = document.getElementById('crawl-mode');
            crawlMode.classList.remove('active');

            // Return focus to the main document
            crawlMode.blur();

            // Stop starfield animation
            if (starfieldAnimationId) {
                cancelAnimationFrame(starfieldAnimationId);
            }

            // Stop clock
            if (crawlClockInterval) {
                clearInterval(crawlClockInterval);
            }

            // Clear crawl text
            document.getElementById('crawl-text').innerHTML = '';

            // Disconnect intersection observer
            if (crawlIntersectionObserver) {
                crawlIntersectionObserver.disconnect();
                crawlIntersectionObserver = null;
            }

            // Always return to normal mode to re-enable zoom/pan
            setMode(MODES.NORMAL);

            // Restore main timeline
            selectedPrompts.clear();
            contentGroup.selectAll('.prompt-dot').classed('selected', false);
            updateSelectionUI();
        }

        // Initialize
        initTimeline();

        // No filtering - showing all projects and prompts

        // Handle window resize - preserve viewport
        window.addEventListener('resize', () => {
            ViewportState.save();
            initTimeline(true); // Skip initial transform
            ViewportState.restore();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Check if in theater mode for arrow key navigation
            const theaterEl = document.getElementById('theater-mode');
            const crawlEl = document.getElementById('crawl-mode');
            const inTheaterMode = theaterEl && theaterEl.classList.contains('active');
            const inCrawlMode = crawlEl && crawlEl.classList.contains('active');

            // Define shortcut keys that should work even in input fields
            const shortcutKeys = ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 's', 'S', '+', '=', '-', '_', ' ', '1', '2', '3', '4', '5'];

            // Don't trigger shortcuts if typing in an input field, UNLESS it's a shortcut key
            if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !shortcutKeys.includes(e.key)) {
                return;
            }

            console.log('Key pressed:', e.key, 'Theater:', inTheaterMode, 'Crawl:', inCrawlMode);

            // Arrow key panning on timeline (when not in theater/crawl mode)
            if (!inTheaterMode && !inCrawlMode) {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (svg && zoom) {
                        const transform = d3.zoomTransform(svg.node());
                        const panAmount = (e.key === 'ArrowRight' ? -200 : 200) * transform.k;
                        const newTransform = d3.zoomIdentity
                            .translate(transform.x + panAmount, 0)
                            .scale(transform.k);
                        svg.call(zoom.transform, newTransform);
                    }
                    return;
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const container = document.getElementById('timeline-scroll-container');
                    const scrollAmount = 200;
                    container.scrollTop += e.key === 'ArrowDown' ? scrollAmount : -scrollAmount;
                    return;
                }
            }

            // 's' key to toggle selection mode
            if (!inTheaterMode && !inCrawlMode && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                toggleSelection();
                return;
            }

            if (e.key === 'Escape') {
                // Check if in crawl mode
                if (document.getElementById('crawl-mode').classList.contains('active')) {
                    exitCrawlMode();
                } else if (inTheaterMode) {
                    exitTheaterMode();
                } else {
                    closePanel();
                    if (selectionMode) {
                        toggleSelection();
                    }
                }
            } else if (inTheaterMode && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                // Navigate between prompts in theater mode
                e.preventDefault();
                animationRunning = false; // Stop automatic animation
                const direction = e.key === 'ArrowRight' ? 1 : -1;
                navigateTheaterPrompt(direction);
            } else if (document.getElementById('crawl-mode').classList.contains('active') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                // Navigate in crawl mode
                e.preventDefault();
                const direction = e.key === 'ArrowDown' ? 1 : -1;
                navigateCrawl(direction);
            } else if (document.getElementById('crawl-mode').classList.contains('active') && ['1', '2', '3', '4', '5'].includes(e.key)) {
                // Rate in crawl mode
                e.preventDefault();
                if (window.crawlPrompts && window.crawlPrompts[window.crawlCurrentIndex]) {
                    rateCrawlPrompt(window.crawlPrompts[window.crawlCurrentIndex].id, parseInt(e.key));
                }
            } else if (inTheaterMode && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                // Scroll the prompt text in theater mode
                e.preventDefault();
                const promptText = document.getElementById('theater-text');
                const scrollAmount = 50;
                promptText.scrollTop += e.key === 'ArrowDown' ? scrollAmount : -scrollAmount;
            } else if (inTheaterMode && ['1', '2', '3', '4', '5'].includes(e.key)) {
                // Rate prompt in theater mode
                e.preventDefault();
                rateTheaterPrompt(parseInt(e.key));
            } else if (inTheaterMode && e.key === ' ') {
                // Toggle auto-play in theater mode
                e.preventDefault();
                toggleTheaterAutoplay();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                zoomOut();
            }
        });

        // Calendar functionality
        let calendarYear = new Date().getFullYear();
        let calendarMonth = new Date().getMonth();
        let promptCountsByDate = {};

        function showCalendar() {
            // Calculate prompt counts by date
            calculatePromptCountsByDate();

            // Set to current date
            const today = new Date();
            calendarYear = today.getFullYear();
            calendarMonth = today.getMonth();

            // Render and show calendar
            renderCalendar();
            document.getElementById('calendar-view').classList.add('active');
        }

        function closeCalendar() {
            document.getElementById('calendar-view').classList.remove('active');
        }

        function changeCalendarMonth(delta) {
            calendarMonth += delta;
            if (calendarMonth > 11) {
                calendarMonth = 0;
                calendarYear++;
            } else if (calendarMonth < 0) {
                calendarMonth = 11;
                calendarYear--;
            }
            renderCalendar();
        }

        function calculatePromptCountsByDate() {
            promptCountsByDate = {};
            prompts.forEach(p => {
                const date = new Date(p.timestamp);
                const dateStr = date.toISOString().split('T')[0];
                promptCountsByDate[dateStr] = (promptCountsByDate[dateStr] || 0) + 1;
            });
        }

        function renderCalendar() {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                               'July', 'August', 'September', 'October', 'November', 'December'];
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            // Update month/year display
            document.getElementById('calendar-month-year').textContent =
                `${monthNames[calendarMonth]} ${calendarYear}`;

            // Get first and last day of month
            const firstDay = new Date(calendarYear, calendarMonth, 1);
            const lastDay = new Date(calendarYear, calendarMonth + 1, 0);

            // Get starting day offset
            const startOffset = firstDay.getDay();

            // Calculate previous month dates to fill in
            const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate();

            // Build calendar grid
            const grid = document.getElementById('calendar-grid');
            grid.innerHTML = '';

            // Add day headers
            dayNames.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-day-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            // Add previous month days
            for (let i = startOffset - 1; i >= 0; i--) {
                const day = prevMonthLastDay - i;
                const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
                const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
                addDayCell(grid, day, prevMonth, prevYear, true);
            }

            // Add current month days
            for (let day = 1; day <= lastDay.getDate(); day++) {
                addDayCell(grid, day, calendarMonth, calendarYear, false);
            }

            // Add next month days to fill the grid
            const cellsUsed = startOffset + lastDay.getDate();
            const remainingCells = Math.ceil(cellsUsed / 7) * 7 - cellsUsed;
            for (let day = 1; day <= remainingCells; day++) {
                const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
                const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
                addDayCell(grid, day, nextMonth, nextYear, true);
            }
        }

        function addDayCell(grid, day, month, year, isOtherMonth) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';

            if (isOtherMonth) {
                cell.classList.add('other-month');
            }

            // Check if today
            const today = new Date();
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                cell.classList.add('today');
            }

            // Get date string
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const promptCount = promptCountsByDate[dateStr] || 0;

            // Set background color based on prompt density
            if (promptCount > 0) {
                const maxCount = Math.max(...Object.values(promptCountsByDate));
                const opacity = Math.min(1, Math.max(0.3, promptCount / maxCount));
                cell.style.background = `rgba(249, 115, 22, ${opacity})`;
            }

            // Add content
            const dayNumber = document.createElement('div');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            cell.appendChild(dayNumber);

            if (promptCount > 0) {
                const countLabel = document.createElement('div');
                countLabel.className = 'calendar-day-count';
                countLabel.textContent = `${promptCount} prompt${promptCount !== 1 ? 's' : ''}`;
                cell.appendChild(countLabel);
            }

            // Add click handler
            cell.addEventListener('click', () => {
                if (promptCount > 0) {
                    closeCalendar();
                    loadDate(dateStr);
                }
            });

            // Add hover handler for tooltip
            cell.title = `${dateStr}: ${promptCount} prompt${promptCount !== 1 ? 's' : ''}`;

            grid.appendChild(cell);
        }
