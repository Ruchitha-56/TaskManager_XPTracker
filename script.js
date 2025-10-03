document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selections ---
    const welcomeScreen = document.getElementById('welcome-screen');
    const taskManagerContainer = document.getElementById('task-manager-container');
    const enterAppButton = document.getElementById('enter-app-button');

    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskDueDateInput = document.getElementById('task-due-date');
    const taskList = document.getElementById('task-list');
    const priorityButtons = document.querySelectorAll('.priority-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const progressBarFill = document.querySelector('.xp-bar-fill');
    const progressBarText = document.querySelector('.xp-bar-text');
    const completionSound = document.getElementById('completion-sound');
    const overdueReminder = document.getElementById('overdue-reminder');
    const overdueCountSpan = document.getElementById('overdue-count');

    // New view mode elements
    const showActiveMissionsBtn = document.getElementById('show-active-missions-btn');
    const showArchiveBtn = document.getElementById('show-archive-btn');

    // --- State Variables ---
    let tasks = []; // Array to store task objects (both active and archived)
    let selectedPriority = 'medium'; // Default priority for new tasks
    let draggingTask = null; // Stores the task being dragged
    let currentViewMode = 'active'; // 'active' or 'archive'

    // --- Utility Functions ---
    const getTodayDateString = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // --- Local Storage Management ---

    /**
     * Saves the current tasks array to Local Storage.
     */
    const saveTasks = () => {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        updateProgressBar(); // Update progress bar whenever tasks change
        checkOverdueTasks(); // Check and update overdue status
    };

    /**
     * Loads tasks from Local Storage on page load.
     */
    const loadTasks = () => {
        const storedTasks = localStorage.getItem('tasks');
        if (storedTasks) {
            tasks = JSON.parse(storedTasks);
            renderTasks(currentViewMode); // Render based on the current view mode
        }
    };

    /**
     * Saves the current theme preference to Local Storage.
     * @param {string} theme - 'dark' or 'light'
     */
    const saveTheme = (theme) => {
        localStorage.setItem('theme', theme);
    };

    /**
     * Loads theme preference from Local Storage and applies it.
     */
    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark
        document.body.classList.toggle('light-mode', savedTheme === 'light');
        updateThemeToggleButton(savedTheme);
    };

    // --- Task Rendering & UI Updates ---

    /**
     * Creates an individual task list item (<li>) element.
     * @param {object} task - The task object.
     * @returns {HTMLElement} The created <li> element.
     */
    const createTaskElement = (task) => {
        const listItem = document.createElement('li');
        listItem.classList.add('task-item');
        listItem.setAttribute('data-id', task.id);

        const isArchivedView = currentViewMode === 'archive'; // Are we currently in the archive view?
        listItem.setAttribute('draggable', !isArchivedView); // Only active tasks are draggable
        if (task.completed) {
            listItem.classList.add('completed');
        }
        if (isArchivedView) { // If in archive view, all tasks here are 'archived' in terms of display
            listItem.classList.add('archived');
        }

        const today = getTodayDateString();
        // Overdue status is only relevant for incomplete tasks in active view
        const isOverdue = task.dueDate && task.dueDate < today && !task.completed && currentViewMode === 'active';
        if (isOverdue) {
            listItem.classList.add('overdue');
        }

        const formattedDueDate = task.dueDate ?
            new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) :
            'No Deadline';

        const formattedCompletionDate = task.completedDate ?
            new Date(task.completedDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) :
            '';

        listItem.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} ${isArchivedView ? 'disabled' : ''}>
            <div class="task-content">
                <span class="task-text">${task.text}</span>
                <div class="task-meta">
                    <span class="task-priority-label ${task.priority}">${task.priority.toUpperCase()}</span>
                    ${task.dueDate && !isArchivedView ? `
                        <span class="task-due-date ${isOverdue ? 'overdue-text' : ''}">
                            <i class="fas fa-calendar-alt"></i> ${formattedDueDate}
                        </span>
                    ` : ''}
                    ${formattedCompletionDate ? `
                        <span class="task-completion-date">
                            <i class="fas fa-flag-checkered"></i> Completed: ${formattedCompletionDate}
                        </span>
                    ` : ''}
                </div>
            </div>
            <div class="task-actions">
                ${!isArchivedView ? `<button class="icon-button edit-button" aria-label="Edit task"><i class="fas fa-edit"></i></button>` : ''}
                <button class="icon-button delete-button" aria-label="Delete task"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        return listItem;
    };

    /**
     * Renders tasks based on the current view mode.
     * @param {string} mode - 'active' or 'archive'
     */
    const renderTasks = (mode) => {
        taskList.innerHTML = ''; // Clear existing tasks
        const filteredTasks = tasks.filter(task => {
            if (mode === 'active') {
                return !task.completed;
            } else if (mode === 'archive') {
                return task.completed;
            }
            return true; // Should not happen
        });

        // For active tasks, sort by overdue then priority then by date (if any)
        if (mode === 'active') {
            filteredTasks.sort((a, b) => {
                const today = getTodayDateString();
                const aOverdue = a.dueDate && a.dueDate < today && !a.completed;
                const bOverdue = b.dueDate && b.dueDate < today && !b.completed;

                if (aOverdue && !bOverdue) return -1;
                if (!aOverdue && bOverdue) return 1;

                // Priority sorting: High > Medium > Low
                const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                const aPriority = priorityOrder[a.priority] || 0;
                const bPriority = priorityOrder[b.priority] || 0;
                if (aPriority !== bPriority) return bPriority - aPriority; // Descending priority

                // For tasks with same priority (and not overdue), sort by due date ascending
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                if (a.dueDate) return -1; // tasks with due date before those without
                if (b.dueDate) return 1;
                return 0;
            });
        }
        // For archived tasks, sort by completion date descending
        else if (mode === 'archive') {
            filteredTasks.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
        }


        filteredTasks.forEach(task => {
            taskList.appendChild(createTaskElement(task));
        });
        updateProgressBar(); // Ensure progress bar is updated on render
        checkOverdueTasks(); // Ensure overdue tasks are highlighted (will hide if in archive mode)
    };

    // --- Progress Bar ---

    /**
     * Updates the XP-style progress bar based on overall project completion.
     */
    const updateProgressBar = () => {
        const totalOverallTasks = tasks.length;
        const totalCompletedTasks = tasks.filter(task => task.completed).length;
        const completionPercentage = totalOverallTasks === 0 ? 0 : Math.round((totalCompletedTasks / totalOverallTasks) * 100);

        if (progressBarFill && progressBarText) {
            progressBarFill.style.width = `${completionPercentage}%`;
            progressBarText.textContent = `${completionPercentage}% Completed (Overall)`;
        } else {
            console.error("Progress bar elements not found!");
        }
    };

    // --- Sound Effects ---

    /**
     * Plays a sound effect when a task is completed.
     * NOTE: Ensure `completion-sound.mp3` exists at the specified path (e.g., 'assets/completion-sound.mp3').
     */
    const playCompletionSound = () => {
        if (completionSound && completionSound.src) { // Check if audio element exists and has a source
            completionSound.currentTime = 0; // Reset to start in case it's played rapidly
            completionSound.play().catch(e => console.warn("Audio play failed:", e)); // Handle potential user gesture policy errors
        } else {
            console.warn("Completion sound element or source not found. Please provide an audio file in the 'assets' folder (e.g., assets/completion-sound.mp3).");
        }
    };

    // --- Overdue Tasks & Notifications ---

    /**
     * Checks for overdue tasks and updates the reminder banner.
     * Only relevant for 'active' view mode.
     */
    const checkOverdueTasks = () => {
        const today = getTodayDateString();
        let overdueCount = 0;

        tasks.forEach(task => {
            // Only count tasks that are not completed
            const isTaskRelevant = !task.completed;
            if (isTaskRelevant) {
                const isOverdue = task.dueDate && task.dueDate < today;
                if (isOverdue) {
                    overdueCount++;
                }
            }
        });

        // Update the DOM elements, but only show if in 'active' view mode
        if (currentViewMode === 'active' && overdueCount > 0) {
            overdueCountSpan.textContent = overdueCount;
            overdueReminder.classList.remove('hidden');
        } else {
            overdueReminder.classList.add('hidden');
        }
    };

    // --- CRUD Operations ---

    /**
     * Adds a new task.
     * @param {string} text - The task description.
     * @param {string} priority - The task priority ('low', 'medium', 'high').
     * @param {string|null} dueDate - The task's due date in 'YYYY-MM-DD' format, or null.
     */
    const addTask = (text, priority, dueDate) => {
        const newTask = {
            id: Date.now().toString(), // Unique ID
            text,
            priority,
            dueDate: dueDate || null, // Store due date
            completed: false,
            completedDate: null // New: Track completion date
        };
        tasks.unshift(newTask); // Add to the beginning
        renderTasks(currentViewMode); // Render based on current view mode
        saveTasks();
    };

    /**
     * Deletes a task.
     * @param {string} id - The ID of the task to delete.
     * @param {HTMLElement} taskElement - The DOM element of the task to delete.
     */
    const deleteTask = (id, taskElement) => {
        // Add a fade-out effect before removal
        taskElement.classList.add('fade-out');
        taskElement.addEventListener('transitionend', () => {
            tasks = tasks.filter(task => task.id !== id);
            renderTasks(currentViewMode); // Re-render based on current view mode
            saveTasks();
        }, { once: true });
    };


    /**
     * Edits an existing task.
     * @param {string} id - The ID of the task to edit.
     * @param {string} newText - The new task description.
     * @param {string} newPriority - The new task priority.
     * @param {string|null} newDueDate - The new task due date.
     */
    const editTask = (id, newText, newPriority, newDueDate) => {
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex > -1) {
            tasks[taskIndex].text = newText;
            tasks[taskIndex].priority = newPriority;
            tasks[taskIndex].dueDate = newDueDate || null; // Update due date
            // Note: completedDate is not changed on edit, only on toggle completion
            renderTasks(currentViewMode); // Re-render based on current view mode
            saveTasks();
        }
    };

    /**
     * Toggles the completion status of a task.
     * @param {string} id - The ID of the task to toggle.
     */
    const toggleTaskCompletion = (id) => {
        const task = tasks.find(task => task.id === id);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedDate = getTodayDateString(); // Set completion date
                playCompletionSound();
            } else {
                task.completedDate = null; // Clear completion date if uncompleted
            }
            saveTasks();
            renderTasks(currentViewMode); // Re-render to show task in correct list
        }
    };

    // --- Drag & Drop Reordering ---

    /**
     * Updates the order of tasks in the `tasks` array after a drag and drop.
     * @param {HTMLElement} draggedElement - The DOM element that was dragged.
     * @param {HTMLElement} targetElement - The DOM element where the dragged element was dropped.
     */
    const updateTaskOrder = (draggedElement, targetElement) => {
        const draggedId = draggedElement.dataset.id;
        const targetId = targetElement.dataset.id;

        const draggedIndex = tasks.findIndex(task => task.id === draggedId);
        const targetIndex = tasks.findIndex(task => task.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [removed] = tasks.splice(draggedIndex, 1); // Remove dragged task
            tasks.splice(targetIndex, 0, removed); // Insert it at the new position
            saveTasks();
            renderTasks(currentViewMode); // Re-render to ensure DOM order matches array
        }
    };

    // --- Event Handlers ---

    // Handle Add Task Form Submission
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        const dueDate = taskDueDateInput.value;

        if (text) {
            addTask(text, selectedPriority, dueDate);
            taskInput.value = ''; // Clear input
            taskDueDateInput.value = ''; // Clear date input
            // Reset priority to default (medium) after adding
            priorityButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.priority-btn[data-priority="medium"]').classList.add('active');
            selectedPriority = 'medium';
        }
    });

    // Handle Priority Selection
    priorityButtons.forEach(button => {
        button.addEventListener('click', () => {
            priorityButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            selectedPriority = button.dataset.priority;
        });
    });

    // Handle Task List Clicks (Delegation for Edit, Delete, Checkbox)
    taskList.addEventListener('click', (e) => {
        const target = e.target;
        const listItem = target.closest('.task-item');

        if (!listItem) return; // Not a task item or child of one

        const taskId = listItem.dataset.id;
        const taskObj = tasks.find(t => t.id === taskId);

        // Delete Task
        if (target.closest('.delete-button')) {
            deleteTask(taskId, listItem);
        }
        // Edit Task (only allow for active tasks)
        else if (target.closest('.edit-button') && currentViewMode === 'active') {
            const currentText = taskObj.text;
            const currentPriority = taskObj.priority;
            const currentDueDate = taskObj.dueDate;

            const newText = prompt('Edit your mission objective:', currentText);
            if (newText !== null) { // If user didn't cancel
                let newPriority = prompt(`Edit priority (high, medium, low):`, currentPriority);
                newPriority = newPriority ? newPriority.toLowerCase() : currentPriority;
                if (!['high', 'medium', 'low'].includes(newPriority)) {
                    newPriority = currentPriority;
                    alert('Invalid priority. Keeping current priority.');
                }

                let newDueDate = prompt(`Edit deadline (YYYY-MM-DD) or leave empty:`, currentDueDate || '');
                if (newDueDate === '') newDueDate = null;

                editTask(taskId, newText.trim(), newPriority, newDueDate);
            }
        }
        // Toggle Completion (Checkbox - only allow for active tasks)
        else if (target.classList.contains('task-checkbox') && currentViewMode === 'active') {
            toggleTaskCompletion(taskId);
        }
    });

    // --- View Mode Toggle ---
    const updateViewModeButtons = (mode) => {
        showActiveMissionsBtn.classList.toggle('active', mode === 'active');
        showArchiveBtn.classList.toggle('active', mode === 'archive');

        // Hide task input form and overdue reminder in archive mode
        taskForm.classList.toggle('hidden', mode === 'archive');
        overdueReminder.classList.toggle('hidden', mode === 'archive');
    };

    showActiveMissionsBtn.addEventListener('click', () => {
        currentViewMode = 'active';
        updateViewModeButtons(currentViewMode);
        renderTasks(currentViewMode);
        // checkOverdueTasks(); // No need to call explicitly, renderTasks calls it
    });

    showArchiveBtn.addEventListener('click', () => {
        currentViewMode = 'archive';
        updateViewModeButtons(currentViewMode);
        renderTasks(currentViewMode);
        // checkOverdueTasks(); // No need to call explicitly, renderTasks calls it
    });


    // --- Theme Toggle ---
    const updateThemeToggleButton = (currentTheme) => {
        themeToggle.innerHTML = currentTheme === 'dark'
            ? '<i class="fas fa-sun"></i>' // Sun icon for light mode
            : '<i class="fas fa-moon"></i>'; // Moon icon for dark mode
    };

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
        saveTheme(currentTheme);
        updateThemeToggleButton(currentTheme);
    });

    // --- Drag & Drop Event Listeners ---

    // Drag and drop should only apply to active tasks
    taskList.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.task-item');
        if (item && !item.classList.contains('archived')) { // Only active tasks can be dragged
            draggingTask = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
        } else {
            e.preventDefault(); // Prevent dragging archived items
        }
    });

    taskList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const item = e.target.closest('.task-item');
        // Allow drop only if dragging an active task over another active task
        if (draggingTask && item && item !== draggingTask && !item.classList.contains('archived')) {
            const boundingBox = item.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (e.clientY - offset > 0) {
                item.style.borderBottom = '2px solid var(--primary-neon)';
                item.style.borderTop = 'none';
            } else {
                item.style.borderTop = '2px solid var(--primary-neon)';
                item.style.borderBottom = 'none';
            }
        }
    });

    taskList.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.task-item');
        if (item) {
            item.style.borderTop = 'none';
            item.style.borderBottom = 'none';
        }
    });

    taskList.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.task-item');
        // Drop only if dragging an active task over another active task
        if (draggingTask && targetItem && draggingTask !== targetItem && !targetItem.classList.contains('archived')) {
            targetItem.style.borderTop = 'none';
            targetItem.style.borderBottom = 'none';

            const boundingBox = targetItem.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (e.clientY - offset > 0) {
                taskList.insertBefore(draggingTask, targetItem.nextSibling);
            } else {
                taskList.insertBefore(draggingTask, targetItem);
            }
            updateTaskOrder(draggingTask, targetItem);
        }
    });

    taskList.addEventListener('dragend', (e) => {
        const items = taskList.querySelectorAll('.task-item');
        items.forEach(item => {
            item.classList.remove('dragging');
            item.style.borderTop = 'none';
            item.style.borderBottom = 'none';
        });
        draggingTask = null;
    });

    // --- Welcome Screen Logic ---
    enterAppButton.addEventListener('click', () => {
        welcomeScreen.classList.add('hidden');
        setTimeout(() => {
            welcomeScreen.style.display = 'none';
            taskManagerContainer.classList.remove('hidden');
            document.body.style.alignItems = 'flex-start'; // Align task manager to top
            // Initial render based on default view mode
            renderTasks(currentViewMode);
            updateProgressBar();
            checkOverdueTasks();
        }, 500); // Matches the transition duration in CSS
    });


    // --- Initialization ---
    loadTheme();
    loadTasks();
    // Ensure the task manager is hidden initially, and only welcome screen is visible
    welcomeScreen.classList.remove('hidden');
    taskManagerContainer.classList.add('hidden');
    // Set min date for task-due-date input to today
    taskDueDateInput.min = getTodayDateString();
    // Set initial active button for view mode
    updateViewModeButtons(currentViewMode);
});
