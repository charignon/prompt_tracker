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
