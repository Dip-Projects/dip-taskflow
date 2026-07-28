/* Auto-converted from backend/legacy/index.html — keep element IDs for mountTaskflowApp bridge */
export default function TaskflowDom() {
  return (
    <>
{/* APP SHELL */}
  <section id="appScreen" className="screen app-screen">
    <header className="topbar">
      <button id="menuToggle" className="icon-btn" aria-label="Toggle menu">☰</button>
      <div className="topbar-brand">
        <img src="https://drive.google.com/thumbnail?id=10FeV3emPMe-VCvGni66b2DOzNIPM3mGp&sz=w40"
             alt="Logo" className="topbar-logo"
             onError={(e) => { e.currentTarget.style.display='none'; if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.display='flex'; }} />
        <span className="topbar-mark" style={{display: 'none'}}>DP</span>
        <span className="topbar-name">DIP Projects</span>
      </div>
      <div className="topbar-user">
        <div className="topbar-user-info">
          <div className="topbar-user-namerow">
            <strong id="userName">—</strong>
            <span id="userRoleTag" className="role-tag">—</span>
          </div>
          <span className="topbar-tagline">Quality + Quantity to be delivered on time every time</span>
        </div>
        <button id="logoutBtn" className="logout-btn">↩ Log out</button>
      </div>
    </header>

    <div className="app-body">
      <aside id="sidebar" className="sidebar">
        <nav id="navList" className="nav-list"></nav>
      </aside>
      <div id="sidebarOverlay" className="sidebar-overlay" hidden></div>

      <main id="mainContent" className="main-content">

        {/* ADD TASK */}
        <section id="view-add" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">Assign a new task</h2>
            <p className="view-sub">Fill in the details below to delegate a task to a team member.</p>
          </div>
          <form id="addTaskForm" className="task-form">
            <div className="field-grid">
              <div className="field">
                <label htmlFor="f-department">Department <span className="req">*</span></label>
                <select id="f-department" required><option value="">Select department</option></select>
              </div>
              <div className="field">
                <label htmlFor="f-employee">Assign to <span className="req">*</span></label>
                <select id="f-employee" required><option value="">Select employee</option></select>
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
              
                <label htmlFor="f-project">Project <span className="req" id="f-project-req">*</span></label>
<select id="f-project"><option value="">Select project</option></select>
              </div>
              <div className="field">
                <label htmlFor="f-tasktype">Task type <span className="req">*</span></label>
                <select id="f-tasktype" required><option value="">Select task type</option></select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-description">Task description <span className="req">*</span></label>
              <textarea id="f-description" rows={3} placeholder="Describe the task in detail..." required></textarea>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="f-hours">Hours to complete</label>
                <input id="f-hours" type="number" min="0" step="0.5" defaultValue="8" />
              </div>
              <div className="field">
                <label htmlFor="f-targetdate">Target date <span className="req">*</span></label>
                <input id="f-targetdate" type="date" required />
              </div>
            </div>
            <div className="field" id="f-deadline-preview-wrap" style={{marginTop: '-6px'}}>
              <div id="f-deadline-preview" className="form-hint">Enter hours to complete to see the employee's calculated deadline (office hours: 9:30 AM–6:30 PM, 1–2 PM lunch excluded).</div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="f-priority">Priority</label>
                <select id="f-priority">
                  <option value="Low">Low</option>
                  <option value="Medium" defaultSelected>Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-reschedule">Rescheduling possible</label>
                <select id="f-reschedule">
                  <option value="false" defaultSelected>No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="f-attachment">Attachment <span className="optional">(optional)</span></label>
                <input id="f-attachment" type="file" />
              </div>
              <div className="field">
                <label htmlFor="f-voicenote">Voice note <span className="optional">(optional)</span></label>
                <input id="f-voicenote" type="file" accept="audio/*" />
              </div>
            </div>
            <p id="addTaskMsg" className="form-error" hidden={true}></p>
            <div className="form-footer">
              <button type="submit" className="primary-btn">Assign task</button>
            </div>
          </form>
        </section>

        {/* ALL DELEGATED TASKS */}
        <section id="view-all" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">All delegated tasks</h2>
            <p className="view-sub">Overview of every task assigned across the team.</p>
          </div>

          <div className="filter-panel">
            <div className="filter-row">
              <div className="filter-field">
                <label className="filter-label">Department</label>
                <select id="filter-department"><option value="">All departments</option></select>
              </div>
              <div className="filter-field">
                <label className="filter-label">Employee</label>
                <select id="filter-employee"><option value="">All employees</option></select>
              </div>
              <div className="filter-field">
                <label className="filter-label">Status</label>
                <select id="filter-status">
                  <option value="">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="filter-field">
                <label className="filter-label">From date</label>
                <input type="date" id="filter-created-from" />
              </div>
              <div className="filter-field">
                <label className="filter-label">To date</label>
                <input type="date" id="filter-created-to" />
              </div>
              <button id="clearAllFilters" className="clear-btn">✕ Clear</button>
            </div>
            <p id="dateRangeCount" hidden={true} className="range-count"></p>
          </div>

          <div className="table-card view-desktop-only">
            <div className="table-scroll">
              <table className="data-table" id="allTasksTable">
                <thead>
                  <tr>
                    <th className="col-sr">Sr No</th>
                    <th className="col-details">Task details</th>
                    <th className="col-date">Planned date</th>
                    <th className="col-assigned">Assigned to</th>
                    <th className="col-voice">Voice note</th>
                    <th className="col-attach">Attachment</th>
                    <th className="col-priority">Priority</th>
                    <th className="col-status">Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody id="allTasksList"></tbody>
              </table>
            </div>
          </div>
          <div id="allTasksCards" className="task-list view-mobile-only"></div>
        </section>

        {/* OVERDUE TASKS */}
        <section id="view-overdue" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">Overdue tasks</h2>
            <p className="view-sub">Tasks whose target date has passed and are still not completed/verified — includes who's currently verifying, if anyone.</p>
          </div>

          <div className="my-tasks-tabs" id="overdueTabBar">
            <button type="button" className="my-tasks-tab-btn active" data-overduetab="task">
              Task
              <span className="my-tasks-tab-badge" id="overdueTaskBadge" hidden={true}>0</span>
            </button>
            <button type="button" className="my-tasks-tab-btn" data-overduetab="recurring">
              Recurring Task
              <span className="my-tasks-tab-badge" id="overdueRecurringBadge" hidden={true}>0</span>
            </button>
          </div>

          <div id="overdueTaskTabPanel">
            <div className="table-card view-desktop-only">
              <div className="table-scroll">
                <table className="data-table" id="overdueTasksTable">
                  <thead>
                    <tr>
                      <th className="col-sr">Sr No</th>
                      <th className="col-details">Task details</th>
                      <th className="col-status">Source</th>
                      <th className="col-date">Planned date</th>
                      <th className="col-assigned">Assigned to</th>
                      <th className="col-assigned">Verifier</th>
                      <th className="col-priority">Priority</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="overdueTasksList"></tbody>
                </table>
              </div>
            </div>
            <div id="overdueTasksCards" className="task-list view-mobile-only"></div>
          </div>

          {/* Recurring tasks that have fallen behind (a due date passed
               without being marked done) — kept in their own tab since
               they're a different kind of record (instances, not delegated
               tasks) with different columns. */}
          <div id="overdueRecurringTabPanel" hidden={true}>
            <div className="table-card view-desktop-only">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th><th>Task</th><th>Frequency</th><th>Overdue since</th><th>Days overdue</th>
                    </tr>
                  </thead>
                  <tbody id="overdueRecurringTableBody"></tbody>
                </table>
              </div>
            </div>
            <div id="overdueRecurringCards" className="task-list view-mobile-only"></div>
          </div>
        </section>


        {/* MY TASKS */}
        <section id="view-my" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">My tasks</h2>
            <p className="view-sub">Your active and pending tasks are listed here.</p>
          </div>

          <div className="my-tasks-tabs" id="myTasksTabBar" hidden={true}>
            <button type="button" className="my-tasks-tab-btn active" data-mytab="mytask">My Task</button>
            <button type="button" className="my-tasks-tab-btn" data-mytab="other">
              Other Pending Work
              <span className="my-tasks-tab-badge" id="otherPendingBadge" hidden={true}>0</span>
            </button>
          </div>

          <div id="myTaskTabPanel">
            <div className="table-card view-desktop-only">
              <div className="table-scroll">
                <table className="data-table" id="myTasksTable">
                  <thead>
                    <tr>
                      <th className="col-sr">Sr No</th>
                      <th className="col-details">Task details</th>
                      <th className="col-date">Due date</th>
                      <th className="col-voice">Voice note</th>
                      <th className="col-attach">Attachment</th>
                      <th className="col-priority">Priority</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="myTasksTableBody"></tbody>
                </table>
              </div>
            </div>
            <div id="myTasksList" className="task-list view-mobile-only"></div>
          </div>

          {/* Other Pending Work — read-only summary of things awaiting the
               admin's attention elsewhere (leave approvals, verifications,
               open tickets). No actions here on purpose — approve/verify/
               resolve from their real pages; an item simply drops off this
               list on its own once it's no longer pending. */}
          <div id="otherPendingTabPanel" hidden={true}>
            <div className="my-tasks-tabs" id="otherPendingSubTabBar" style={{marginBottom: 16}}>
              <button type="button" className="my-tasks-tab-btn active" data-subtab="leave">
                🌴 Leave
                <span className="my-tasks-tab-badge" id="otherPendingLeaveBadge" hidden={true}>0</span>
              </button>
              <button type="button" className="my-tasks-tab-btn" data-subtab="verification">
                🔎 Verification
                <span className="my-tasks-tab-badge" id="otherPendingVerificationBadge" hidden={true}>0</span>
              </button>
              <button type="button" className="my-tasks-tab-btn" data-subtab="tickets">
                🟠 Tickets
                <span className="my-tasks-tab-badge" id="otherPendingTicketsBadge" hidden={true}>0</span>
              </button>
            </div>

            <div id="otherPendingLeavesList" className="task-list"></div>

            <div id="otherPendingVerificationsWrap" hidden={true}>
              <div className="table-card view-desktop-only">
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="col-reqid">Request ID</th>
                        <th className="col-tasksr">Task Sr No</th>
                        <th className="col-vproject">Project</th>
                        <th className="col-vtasktype">Task Type</th>
                        <th className="col-vsubmitted">Submitted By</th>
                        <th className="col-vattach">Attachments</th>
                        <th className="col-vdate">Submission Date</th>
                        <th className="col-vactions">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="otherPendingVerificationsTableBody"></tbody>
                  </table>
                </div>
              </div>
              <div id="otherPendingVerificationsList" className="task-list view-mobile-only"></div>
            </div>

            <div id="otherPendingTicketsList" className="task-list" hidden={true}></div>
          </div>
        </section>

        {/* MANAGE EMPLOYEES */}
        <section id="view-employees" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">Manage employees</h2>
              <p className="view-sub">Add, activate, or deactivate team members.</p>
            </div>
            <button id="openAddEmployee" className="primary-btn primary-btn-inline">+ Add employee</button>
          </div>

          <div className="table-card view-desktop-only" style={{marginTop: 20}}>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Department</th><th>Designation</th><th>Reporting Head</th>
                    <th>Role</th><th>Username</th><th>Status</th><th>Verifier</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="employeesTableBody"></tbody>
              </table>
            </div>
          </div>
          <div id="employeesCards" className="employee-card-list view-mobile-only" style={{marginTop: 20}}></div>
        </section>

        {/* ORG HIERARCHY */}
        <section id="view-hierarchy" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">Org Hierarchy</h2>
              <p className="view-sub">Reporting structure — inactive employees are hidden={true} automatically.</p>
            </div>
          </div>
          <div id="hierarchyTreeContainer" className="org-tree-container" style={{marginTop: 20}}></div>
        </section>

        {/* MANAGE SITES */}
        <section id="view-sites" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">Manage sites</h2>
              <p className="view-sub">Track construction sites and assigned personnel.</p>
            </div>
            <button id="openAddSite" className="primary-btn primary-btn-inline">+ Add site</button>
          </div>
          <div className="table-card" style={{marginTop: 20}}>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Site name</th><th>Client</th><th>Location</th>
                    <th>Type</th><th>Status</th><th>Team leader</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="sitesTableBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        {/* MASTER DATA */}
        <section id="view-masterdata" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">Departments &amp; task types</h2>
            <p className="view-sub">Manage the master lists used across all task assignments.</p>
          </div>
          <div className="field-grid">
            <div>
              <h3 className="subsection-title">Departments</h3>
              <form id="addDepartmentForm" className="task-form">
                <div className="field">
                  <label htmlFor="new-department-name">Department name</label>
                  <input id="new-department-name" type="text" placeholder="e.g., Engg. Division" required />
                </div>
                <p id="addDepartmentMsg" className="form-error" hidden={true}></p>
                <button type="submit" className="primary-btn">Add department</button>
              </form>
              <div className="table-card" style={{marginTop: 16}}>
                <table className="data-table">
                  <thead><tr><th>Department</th></tr></thead>
                  <tbody id="departmentsTableBody"></tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="subsection-title">Task types</h3>
              <form id="addTaskTypeForm" className="task-form">
                <div className="field">
                  <label htmlFor="new-tasktype-name">Task type name</label>
                  <input id="new-tasktype-name" type="text" placeholder="e.g., Site Visit" required />
                </div>
                <p id="addTaskTypeMsg" className="form-error" hidden={true}></p>
                <button type="submit" className="primary-btn">Add task type</button>
              </form>
              <div className="table-card" style={{marginTop: 16}}>
                <table className="data-table">
                  <thead><tr><th>Task type</th></tr></thead>
                  <tbody id="taskTypesTableBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* PERMISSIONS */}
        <section id="view-permissions" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">Permissions</h2>
            <p className="view-sub">Decide what each employee is allowed to do, without making them a full admin.</p>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table className="data-table" id="permissionsTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th className="perm-col">Add site</th>
                    <th className="perm-col">Add employee</th>
                    <th className="perm-col">Resolve tickets</th>
                    <th className="perm-col">Verify tasks</th>
                    <th className="perm-col">MIS Executive</th>
                  </tr>
                </thead>
                <tbody id="permissionsTableBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        {/* VERIFICATIONS */}
        <section id="view-verifications" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">Verification requests</h2>
            <p className="view-sub">Review and approve tasks pending your sign-off.</p>
          </div>
          <div className="table-card view-desktop-only">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-reqid">Request ID</th>
                    <th className="col-tasksr">Task Sr No</th>
                    <th className="col-vproject">Project</th>
                    <th className="col-vtasktype">Task Type</th>
                    <th className="col-vsubmitted">Submitted By</th>
                    <th className="col-vattach">Attachments</th>
                    <th className="col-vdate">Submission Date</th>
                    <th className="col-vactions">Actions</th>
                  </tr>
                </thead>
                <tbody id="verificationsTableBody"></tbody>
              </table>
            </div>
          </div>
          <div id="verificationsList" className="task-list view-mobile-only"></div>
        </section>

        {/* RESCHEDULE REQUESTS — admin sees every pending one (approve/reject);
             everyone else sees only their own, read-only. */}
        <section id="view-reschedule-requests" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">🗓️ Reschedule requests</h2>
            <p className="view-sub" id="reschedViewSub">Tasks where a new date has been requested.</p>
          </div>
          <div className="table-card view-desktop-only">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-sr">Sr No</th>
                    <th className="col-resched-emp">Employee</th>
                    <th className="col-resched-task">Task</th>
                    <th className="col-resched-date">Current date</th>
                    <th className="col-resched-date">Requested date</th>
                    <th className="col-resched-reason">Reason</th>
                    <th className="col-resched-status">Status</th>
                    <th className="col-resched-decided">Decided by</th>
                    <th className="col-resched-actions">Actions</th>
                  </tr>
                </thead>
                <tbody id="reschedRequestsTableBody"></tbody>
              </table>
            </div>
          </div>
          <div id="reschedRequestsList" className="task-list view-mobile-only"></div>
        </section>

        {/* APPLY LEAVE (everyone) */}
        <section id="view-applyleave" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">🌴 Apply Leave</h2>
              <p className="view-sub">Submit a leave request and track its approval status.</p>
            </div>
            <button id="openApplyLeave" className="primary-btn primary-btn-inline">+ Apply leave</button>
          </div>
          <div id="myLeavesList" className="ticket-list" style={{marginTop: 20}}></div>
        </section>

        {/* LEAVE APPROVALS (admin) */}
        <section id="view-leaveapprovals" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">🗒️ Leave Approvals</h2>
            <p className="view-sub">Review leave requests raised by the team and approve or reject them.</p>
          </div>
          <div className="filter-panel">
            <div className="filter-row">
              <div className="filter-field">
                <label className="filter-label">Status</label>
                <select id="leaveApprovalsStatusFilter">
                  <option value="">All</option>
                  <option value="Pending" defaultSelected>Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>
          <div id="leaveApprovalsList" className="ticket-list" style={{marginTop: 20}}></div>
        </section>

        {/* TICKETS */}
        <section id="view-tickets" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title" id="ticketsViewTitle">Tickets</h2>
              <p className="view-sub" id="ticketsViewSub">Raise and track support issues.</p>
            </div>
            <button id="openRaiseTicket" className="primary-btn primary-btn-inline">+ Raise ticket</button>
          </div>
          <div id="ticketsList" className="ticket-list" style={{marginTop: 20}}></div>
        </section>

        
{/* CORRECTIONS */}
        <section id="view-corrections" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">↩ Corrections</h2>
            <p className="view-sub">Tasks sent back to you — review the note and resubmit for verification.</p>
          </div>
          <div className="table-card view-desktop-only" style={{marginTop: 20}}>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-sr">Sr No</th>
                    <th className="col-details">Task details</th>
                    <th>Correction note</th>
                    <th className="col-priority">Priority</th>
                    <th className="col-status">Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody id="correctionsTableBody"></tbody>
              </table>
            </div>
          </div>
          <div id="correctionsList" className="task-list view-mobile-only" style={{marginTop: 20}}></div>
        </section>
        {/* UPDATIONS */}
        <section id="view-updations" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">📝 Updations</h2>
            <p className="view-sub">Tasks where admin/verifier has requested changes — review the note and make updates.</p>
          </div>
          <div id="updationsList" className="task-list" style={{marginTop: 20}}></div>
        </section>

        {/* RECURRING TASKS */}
        <section id="view-recurring" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">🔁 Recurring Tasks</h2>
              <p className="view-sub" id="recurringViewSub">Tasks that repeat on a schedule.</p>
            </div>
            <button id="openAddRecurring" className="primary-btn primary-btn-inline" hidden={true}>+ Add recurring task</button>
          </div>
          <div id="adminRecurringWrap" hidden={true}>
            <div className="table-card view-desktop-only" style={{marginTop: 20}}>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th><th>Description</th><th>Frequency</th>
                      <th>Period</th><th>Checkpoints</th><th>Active</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="recurringTasksTableBody"></tbody>
                </table>
              </div>
            </div>
            <div id="adminRecurringCards" className="task-list view-mobile-only" style={{marginTop: 20}}></div>
          </div>
         
          <div id="employeeRecurringWrap" hidden={true} style={{marginTop: 20}}>
            <div className="table-card view-desktop-only">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th><th>Frequency</th><th>Planned Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="employeeRecurringTableBody"></tbody>
                </table>
              </div>
            </div>
            <div id="employeeRecurringList" className="view-mobile-only"></div>
          </div>
        </section>

        {/* DRAWINGS — ADD */}
        <section id="view-drawings-add" className="view" hidden={true}>
          <div className="view-heading">
            <h2 className="view-title">🖊️ Add Drawing</h2>
            <p className="view-sub">Fill in the drawing details below and submit.</p>
          </div>
          <div className="drawing-form-card">
            <p id="drawingFormMsg" className="form-error" hidden={true}></p>
            <form id="drawingForm" autoComplete="off">

              <div className="form-section-label">Drawing Details</div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="drw-category">Drawing Category <span className="req">*</span></label>
                  <select id="drw-category" required>
                    <option value="">-- Select Category --</option>
                    <option>Layout</option>
                    <option>Presentation</option>
                    <option>Architectural</option>
                    <option>Structural</option>
                    <option>MEP</option>
                    <option>Others</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="drw-sub1">Sub Category 1</label>
                  <input id="drw-sub1" type="text" placeholder="e.g. Floor Plans" />
                </div>
                <div className="field">
                  <label htmlFor="drw-sub2">Sub Category 2</label>
                  <input id="drw-sub2" type="text" placeholder="e.g. Ground Floor" />
                </div>
                <div className="field">
                  <label htmlFor="drw-sub3">Sub Category 3</label>
                  <input id="drw-sub3" type="text" placeholder="e.g. Toilet Layout" />
                </div>
              </div>

              <div className="form-section-label">Project Info</div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="drw-project">Project Name <span className="req">*</span></label>
                  <select id="drw-project" required>
                    <option value="">-- Select Project --</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="drw-date">Drawing Date <span className="req">*</span></label>
                  <input id="drw-date" type="date" required />
                </div>
                <div className="field">
                  <label htmlFor="drw-head">Head / Reviewer <span className="req">*</span></label>
                  <select id="drw-head" required>
                    <option value="">-- Select Head --</option>
                  </select>
                </div>
              </div>

              <div className="form-section-label">Additional Info</div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="drw-remarks">Remarks / Notes</label>
                  <textarea id="drw-remarks" rows={2} placeholder="Any notes about this drawing set…"></textarea>
                </div>
                <div className="field">
                  <label htmlFor="drw-files">Upload Drawing File(s)</label>
                  <input id="drw-files" type="file" multiple accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.zip" />
                  <div style={{fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4}}>Supported: PDF, DWG, DXF, Images, ZIP | Multiple files allowed</div>
                </div>
                <div className="field" style={{maxWidth: 160}}>
                  <label htmlFor="drw-revision">Revision No.</label>
                  <input id="drw-revision" type="text" placeholder="R0" />
                </div>
              </div>

              <div className="modal-footer" style={{marginTop: 20, padding: 0}}>
                <button type="button" id="drawingResetBtn" className="ghost-btn-text">Reset</button>
                <button type="submit" className="primary-btn">💾 Save Drawing</button>
              </div>
            </form>
          </div>
        </section>

        {/* DRAWINGS — ALL */}
        <section id="view-drawings-all" className="view" hidden={true}>
          <div className="view-header-row">
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">📐 All Drawings <span id="drawingsCount" className="tab-count" style={{fontSize: '0.8rem', verticalAlign: 'middle'}}></span></h2>
              <p className="view-sub">Browse, filter and manage all drawing records.</p>
            </div>
            <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
              <select id="drwFilterProject" style={{padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem'}}>
                <option value="">All Projects</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{marginTop: 18}}>
            <table className="data-table" id="drawingsTable">
              <thead>
                <tr>
                  <th className="col-sr">SR</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Sub Cat 1</th>
                  <th>Sub Cat 2</th>
                  <th>Sub Cat 3</th>
                  <th className="col-date">Date</th>
                  <th>Head</th>
                  <th style={{textAlign: 'center'}}>Rev</th>
                  <th>Remarks</th>
                  <th style={{textAlign: 'center'}}>Preview</th>
                  <th>Added By</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody id="drawingsTableBody">
                <tr><td colspan="13" className="empty-state">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* DAILY REPORT */}
        <section id="view-daily-report" className="view" hidden={true}>
          <div className="view-header-row" style={{flexWrap: 'wrap', gap: 12}}>
            <div className="view-heading" style={{marginBottom: 0}}>
              <h2 className="view-title">📋 Daily Report</h2>
              <p className="view-sub" id="drptSubtitle">Task status report</p>
            </div>
            <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
              <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                <button className="drpt-mode-btn active" id="drptModeSingle">Single Day</button>
                <button className="drpt-mode-btn" id="drptModeRange">Date Range</button>
              </div>
              <div id="drptSingleWrap" style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <input type="date" id="drptDate" style={{padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem'}} />
              </div>
              <div id="drptRangeWrap" style={{display: 'none', gap: 8, alignItems: 'center'}}>
                <input type="date" id="drptFromDate" style={{padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem'}} />
                <span style={{color: 'var(--text-muted)', fontSize: 12}}>to</span>
                <input type="date" id="drptToDate" style={{padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem'}} />
              </div>
              <button id="drptGenBtn" className="primary-btn primary-btn-inline">🔄 Generate</button>
              <button id="drptDownloadBtn" className="ghost-btn" style={{display: 'none'}}>⬇️ Download PDF</button>
            </div>
          </div>
          <div id="drptBody" style={{marginTop: 20}}></div>
        </section>

      </main>
    </div>
  </section>

  {/* Add Employee Modal */}
  <div id="employeeModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Add new employee</h3>
        <button className="modal-close" id="closeEmployeeModal">&times;</button>
      </div>
      <form id="employeeForm" className="modal-body">
        <div className="field">
          <label htmlFor="emp-fullname">Full name <span className="req">*</span></label>
          <input id="emp-fullname" type="text" placeholder="Enter full name" required />
        </div>
        <div className="field">
          <label htmlFor="emp-department">Department <span className="req">*</span></label>
          <input id="emp-department" type="text" placeholder="e.g., Site Execution" required />
        </div>
        <div className="field">
          <label htmlFor="emp-designation">Designation <span className="req">*</span></label>
          <input id="emp-designation" type="text" placeholder="e.g., Project Manager" required />
        </div>
        <div className="field">
          <label htmlFor="emp-role">Role <span className="req">*</span></label>
          <select id="emp-role" required>
            <option value="">Select role</option>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp-reporting-head">Reporting Head <span className="optional">(optional)</span></label>
          <select id="emp-reporting-head">
            <option value="">— None (Top level) —</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="emp-site">Project / Site <span className="optional">(for Site Engineer)</span></label>
          <select id="emp-site">
            <option value="">— None —</option>
          </select>
          <p className="form-note" style={{marginTop: 6}}>Required for Site Engineers — Clock In / reports use this site.</p>
        </div>
        <p className="form-note">Username and password will be auto-generated after submission.</p>
        <p id="employeeFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelEmployeeModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Add employee</button>
        </div>
      </form>
    </div>
  </div>

  {/* Edit Employee Modal */}
  <div id="editEmployeeModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Edit employee</h3>
        <button className="modal-close" id="closeEditEmployeeModal">&times;</button>
      </div>
      <form id="editEmployeeForm" className="modal-body">
        <input type="hidden" id="edit-emp-id" />
        <div className="field">
          <label htmlFor="edit-emp-fullname">Full name <span className="req">*</span></label>
          <input id="edit-emp-fullname" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="edit-emp-department">Department <span className="req">*</span></label>
          <input id="edit-emp-department" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="edit-emp-designation">Designation <span className="req">*</span></label>
          <input id="edit-emp-designation" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="edit-emp-role">Role <span className="req">*</span></label>
          <select id="edit-emp-role" required>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-emp-reporting-head">Reporting Head <span className="optional">(optional)</span></label>
          <select id="edit-emp-reporting-head">
            <option value="">— None (Top level) —</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-emp-site">Project / Site <span className="optional">(for Site Engineer)</span></label>
          <select id="edit-emp-site">
            <option value="">— None —</option>
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <div>
            <button type="button" id="edit-emp-status-toggle" className="status-toggle active" data-active="true">Active</button>
          </div>
          <p className="form-note" style={{marginTop: 6}}>Inactive employees are removed from the Org Hierarchy and from every "assign to / reporting head" dropdown.</p>
        </div>
        <div className="field">
          <label htmlFor="edit-emp-password">New password <span className="optional">(leave blank to keep current)</span></label>
          <div className="password-field">
            <input id="edit-emp-password" type="password" placeholder="Set a new password" minLength="6" autoComplete="new-password" />
            <button type="button" id="toggleEditPassword" className="ghost-btn" aria-label="Show password">👁</button>
          </div>
        </div>
        <p id="editEmployeeFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelEditEmployeeModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Save changes</button>
        </div>
      </form>
    </div>
  </div>

  {/* Credentials Modal */}
  <div id="credsModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Employee added ✅</h3>
        <button className="modal-close" id="closeCredsModal">&times;</button>
      </div>
      <div className="modal-body">
        <p>Share these login details with the employee — they won't be shown again.</p>
        <div className="creds-box">
          <div><span>Username</span><strong id="credsUsername"></strong></div>
          <div><span>Password</span><strong id="credsPassword"></strong></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="primary-btn primary-btn-inline" id="closeCredsModalBtn">Done</button>
        </div>
      </div>
    </div>
  </div>

  {/* Add Site Modal */}
  <div id="siteModal" className="modal-backdrop" hidden={true}>
    <div className="modal modal-wide">
      <div className="modal-header">
        <h3>Add new construction site</h3>
        <button className="modal-close" id="closeSiteModal">&times;</button>
      </div>
      <form id="siteForm" className="modal-body">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="site-client">Client name <span className="req">*</span></label>
            <input id="site-client" type="text" placeholder="Enter client name" required />
          </div>
          <div className="field">
            <label htmlFor="site-name">Site name <span className="req">*</span></label>
            <input id="site-name" type="text" placeholder="Enter site name" required />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="site-type">Type of project <span className="req">*</span></label>
            <select id="site-type" required>
              <option value="">Select project type</option>
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Industrial">Industrial</option>
              <option value="Institutional">Institutional</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="site-location">Site location <span className="req">*</span></label>
            <input id="site-location" type="text" placeholder="e.g., Pune, Mumbai, Delhi" required />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="site-start">Start date <span className="req">*</span></label>
            <input id="site-start" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="site-end">Expected end date</label>
            <input id="site-end" type="date" />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="site-teamleader">Team leader <span className="req">*</span></label>
            <select id="site-teamleader" required><option value="">Select team leader</option></select>
          </div>
          <div className="field">
            <label htmlFor="site-coordinator">Co-ordinator <span className="req">*</span></label>
            <select id="site-coordinator" required><option value="">Select coordinator</option></select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="site-incharge">Site incharge <span className="req">*</span></label>
          <select id="site-incharge" required><option value="">Select site incharge</option></select>
        </div>
        <div className="field">
          <label htmlFor="site-description">Project description</label>
          <textarea id="site-description" rows={3} placeholder="Enter project description..."></textarea>
        </div>
        <p id="siteFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelSiteModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Add site</button>
        </div>
      </form>
    </div>
  </div>

  {/* Toast */}
  <div id="toast" className="toast" hidden={true}></div>

  {/* Verify Modal */}
  <div id="verifyModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Send for verification</h3>
        <button className="modal-close" id="closeVerifyModal">&times;</button>
      </div>
      <form id="verifyForm" className="modal-body">
        <div className="field">
          <label htmlFor="verify-person">Send to <span className="req">*</span></label>
          <select id="verify-person" required><option value="">Select a verifier</option></select>
        </div>
        <div className="field">
          <label htmlFor="verify-files">Attach files <span className="optional">(max 3, optional)</span></label>
          <input id="verify-files" type="file" multiple accept="*/*" />
          <span className="form-note">Hold Ctrl / Cmd to select multiple files</span>
        </div>
        <p id="verifyFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelVerifyModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Send</button>
        </div>
      </form>
    </div>
  </div>

  {/* Ticket Modal */}
  <div id="ticketModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Raise a ticket</h3>
        <button className="modal-close" id="closeTicketModal">&times;</button>
      </div>
      <form id="ticketForm" className="modal-body">
        {/* Shown only when raised from a task */}
        <div id="ticketTaskBanner" className="ticket-task-banner" hidden={true}>
          <span className="ticket-task-banner-icon">🔗</span>
          <span>Linked to task: <strong id="ticketTaskBannerText"></strong></span>
        </div>
        <div className="field">
          <label htmlFor="ticket-category">Category <span className="req">*</span></label>
          <select id="ticket-category" required>
            <option value="">Select category</option>
            <option value="Technical">🔧 Technical issue</option>
            <option value="Task">📋 Task related</option>
            <option value="Access">🔑 Access / Login issue</option>
            <option value="Other">📌 Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ticket-description">Describe the issue <span className="req">*</span></label>
          <textarea id="ticket-description" rows={4} placeholder="Explain your issue in detail..." required></textarea>
        </div>
        {/* Screenshot / screen recording — shown only for Technical or Access */}
        <div id="ticketMediaFields" className="field" hidden={true}>
          <label>Screenshot or screen recording <span className="optional">(optional)</span></label>
          <p className="form-note">Attach a screenshot (PNG/JPG) or a short screen recording (MP4/WebM) to help us understand the issue.</p>
          <input id="ticket-media" type="file" accept="image/png,image/jpeg,image/jpg,video/mp4,video/webm" />
        </div>
        <p id="ticketFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelTicketModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Submit ticket</button>
        </div>
      </form>
    </div>
  </div>

  {/* Updation Modal (verifier/admin → send updation note to employee) */}
  <div id="updationModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>📝 Request Updation</h3>
        <button className="modal-close" id="closeUpdationModal">&times;</button>
      </div>
      <form id="updationForm" className="modal-body">
        <p className="form-note" style={{marginBottom: 12}}>Describe what needs to be updated. The employee will see this note in their Updations section.</p>
        <div className="field">
          <label htmlFor="updation-note">Updation note <span className="req">*</span></label>
          <textarea id="updation-note" rows={4} placeholder="e.g. Please update the floor plan measurements and recheck the material quantities…" required></textarea>
        </div>
        <p id="updationFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelUpdationModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">📤 Send Updation</button>
        </div>
      </form>
    </div>
  </div>

  {/* Solution Modal (admin/resolver → write solution) */}
  <div id="solutionModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>💡 Provide solution</h3>
        <button className="modal-close" id="closeSolutionModal">&times;</button>
      </div>
      <div className="modal-body">
        <div id="solutionTicketInfo" className="solution-ticket-info"></div>
        <div className="field" style={{marginTop: 14}}>
          <label htmlFor="solution-text">Solution / response <span className="req">*</span></label>
          <textarea id="solution-text" rows={5} placeholder="Write the solution or action taken..."></textarea>
        </div>
        <p id="solutionFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelSolutionModal">Cancel</button>
          <button type="button" className="primary-btn primary-btn-inline" id="submitSolutionBtn">Submit &amp; Resolve</button>
        </div>
      </div>
    </div>
  </div>

  {/* Apply Leave Modal */}
  <div id="leaveModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Apply for leave</h3>
        <button className="modal-close" id="closeLeaveModal">&times;</button>
      </div>
      <form id="leaveForm" className="modal-body">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="leave-from">From date <span className="req">*</span></label>
            <input id="leave-from" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="leave-to">To date <span className="req">*</span></label>
            <input id="leave-to" type="date" required />
          </div>
        </div>
        <div className="field">
          <label className="checkbox-label">
            <input id="leave-halfday" type="checkbox" />
            Half day leave
          </label>
        </div>
        <div className="field">
          <label htmlFor="leave-reason">Reason <span className="req">*</span></label>
          <textarea id="leave-reason" rows={3} placeholder="Why are you taking leave..." required></textarea>
        </div>
        <p id="leaveFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelLeaveModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Submit request</button>
        </div>
      </form>
    </div>
  </div>

  {/* Reject Leave Modal (admin — reason optional) */}
  <div id="rejectLeaveModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Reject leave request</h3>
        <button className="modal-close" id="closeRejectLeaveModal">&times;</button>
      </div>
      <form id="rejectLeaveForm" className="modal-body">
        <div className="field">
          <label htmlFor="reject-leave-reason">Reason <span className="optional">(optional)</span></label>
          <textarea id="reject-leave-reason" rows={3} placeholder="Let them know why (optional)..."></textarea>
        </div>
        <p id="rejectLeaveFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelRejectLeaveModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Reject request</button>
        </div>
      </form>
    </div>
  </div>

  {/* Recurring Task Checkpoint Modal (employee: tick checkpoints, then Submit) */}
  <div id="checkpointModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3 id="checkpointModalTitle">Checkpoints</h3>
        <button className="modal-close" id="closeCheckpointModal">&times;</button>
      </div>
      <div className="modal-body">
        <div id="checkpointModalList"></div>
        <p id="checkpointModalMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelCheckpointModal">Cancel</button>
          <button type="button" className="primary-btn primary-btn-inline" id="submitCheckpointModal">Submit</button>
        </div>
      </div>
    </div>
  </div>

  {/* Reschedule Modal */}
  <div id="rescheduleModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Reschedule task</h3>
        <button className="modal-close" id="closeRescheduleModal">&times;</button>
      </div>
      <form id="rescheduleForm" className="modal-body">
        
        <div className="field">
          <label htmlFor="reschedule-date">New target date <span className="req">*</span></label>
          <input id="reschedule-date" type="datetime-local" required />
        </div>
        <div className="field">
          <label htmlFor="reschedule-reason">Reason</label>
          <textarea id="reschedule-reason" rows={2} placeholder="Why is this task being rescheduled?"></textarea>
        </div>
        <p id="rescheduleFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelRescheduleModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Save</button>
        </div>
      </form>
    </div>
  </div>

  {/* Request Reschedule Modal (employee — goes to admin for approval, doesn't change the date directly) */}
  <div id="reschedRequestModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Request a reschedule</h3>
        <button className="modal-close" id="closeReschedRequestModal">&times;</button>
      </div>
      <form id="reschedRequestForm" className="modal-body">
        <p className="form-note" style={{margin: '0 0 14px'}}>This sends a request to the admin — the task's date won't change until it's approved.</p>
        <div className="field">
          <label htmlFor="reschedreq-date">Requested new date <span className="req">*</span></label>
          <input id="reschedreq-date" type="date" required />
        </div>
        <div className="field">
          <label htmlFor="reschedreq-reason">Reason <span className="optional">(optional)</span></label>
          <textarea id="reschedreq-reason" rows={3} placeholder="Why do you need this task moved?"></textarea>
        </div>
        <p id="reschedRequestFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelReschedRequestModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Send request</button>
        </div>
      </form>
    </div>
  </div>

  {/* SET EXTENDED TIME (Overdue view only — does not change target_date) */}
  <div id="overdueExtendModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>⏱ Set extended time</h3>
        <button className="modal-close" id="closeOverdueExtendModal">&times;</button>
      </div>
      <form id="overdueExtendForm" className="modal-body">
        <p className="view-sub" style={{margin: '0 0 14px'}}>This only affects the Overdue Tasks view — the employee and other views still show the original planned date.</p>
        <div className="field">
          <label htmlFor="overdue-extend-date">New time the employee asked for <span className="req">*</span></label>
          <input id="overdue-extend-date" type="datetime-local" required />
        </div>
        <div className="field">
          <label htmlFor="overdue-extend-reason">Reason (optional)</label>
          <textarea id="overdue-extend-reason" rows={3} placeholder="e.g. waiting on material delivery"></textarea>
        </div>
        <p id="overdueExtendFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelOverdueExtendModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Save</button>
        </div>
      </form>
    </div>
  </div>

  {/* OVERDUE TASK DETAIL PANEL (right-side drawer: Today / Pending tabs) */}
  <div id="overdueDrawerBackdrop" className="drawer-backdrop" hidden={true}>
    <div className="drawer-panel">
      <div className="drawer-header">
        <h3>Overdue tasks</h3>
        <button className="modal-close" id="closeOverdueDrawer">&times;</button>
      </div>
      <div className="drawer-tabs">
        <button type="button" className="drawer-tab active" id="overdueTabToday">Today <span className="tab-count" id="overdueTabTodayCount">0</span></button>
        <button type="button" className="drawer-tab" id="overdueTabPending">Pending <span className="tab-count" id="overdueTabPendingCount">0</span></button>
      </div>
      <div className="drawer-body" id="overdueDrawerBody"></div>
    </div>
  </div>


  {/* Reassign Modal */}
  <div id="reassignModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Reassign task</h3>
        <button className="modal-close" id="closeReassignModal">&times;</button>
      </div>
      <form id="reassignForm" className="modal-body">
        <div className="field">
          <label htmlFor="reassign-employee">New assignee <span className="req">*</span></label>
          <select id="reassign-employee" required><option value="">Select employee</option></select>
        </div>
        <p className="form-note">The task will be reset to "Pending" for the new assignee.</p>
        <p id="reassignFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelReassignModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Reassign</button>
        </div>
      </form>
    </div>
  </div>

  {/* Correction Modal (verifier → employee) */}
  <div id="correctionModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>↩ Send for Correction</h3>
        <button className="modal-close" id="closeCorrectionModal">&times;</button>
      </div>
      <form id="correctionForm" className="modal-body">
        <div className="field">
          <label htmlFor="correction-note">Correction note <span className="req">*</span></label>
          <textarea id="correction-note" rows={4} placeholder="Describe what needs to be corrected…" required></textarea>
        </div>
        <div className="field">
          <label>Voice note <span className="optional">(optional)</span></label>
          <div className="voice-recorder-wrap" id="corrVoiceRecorderWrap">
            <div className="voice-recorder-btns">
              <button type="button" id="corrStartRecord" className="ghost-btn-text">🎤 Start recording</button>
              <button type="button" id="corrStopRecord" className="ghost-btn-text" disabled style={{color: '#e53e3e'}}>⏹ Stop</button>
            </div>
            <span id="corrRecordStatus" className="form-note"></span>
            <audio id="corrVoicePlayback" controls hidden={true} style={{marginTop: 8, width: '100%'}}></audio>
          </div>
        </div>
        <p id="correctionFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelCorrectionModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Send Correction</button>
        </div>
      </form>
    </div>
  </div>

  {/* Resend Verification Modal (employee after correction) */}
  <div id="resendVerifyModal" className="modal-backdrop" hidden={true}>
    <div className="modal">
      <div className="modal-header">
        <h3>Resend for Verification</h3>
        <button className="modal-close" id="closeResendVerifyModal">&times;</button>
      </div>
      <form id="resendVerifyForm" className="modal-body">
        <p className="form-note" style={{marginBottom: 12}}>Sending back to: <strong id="resendVerifierName">—</strong></p>
        <div className="field">
          <label htmlFor="resend-files">Attach files <span className="optional">(max 3)</span></label>
          <input id="resend-files" type="file" multiple accept="*/*" />
          <span className="form-note">Hold Ctrl / Cmd to select multiple files</span>
        </div>
        <p id="resendVerifyFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelResendVerifyModal">Cancel</button>
          <button type="submit" className="primary-btn primary-btn-inline">Resend for Verification</button>
        </div>
      </form>
    </div>
  </div>


  {/* Add/Edit Recurring Task Modal */}
  <div id="recurringModal" className="modal-backdrop" hidden={true}>
    <div className="modal modal-wide">
      <div className="modal-header">
        <h3 id="recurringModalTitle">🔁 Create Recurring Task</h3>
        <button className="modal-close" id="closeRecurringModal">&times;</button>
      </div>
      <div className="modal-body" id="recurringModalBody">
        <input type="hidden" id="recurring-edit-id" />
        <div className="field-grid">
          <div className="field">
            <label htmlFor="rec-department">Department <span className="optional">(Optional)</span></label>
            <select id="rec-department"><option value="">Select Department</option></select>
          </div>
          <div className="field">
            <label htmlFor="rec-employee">Employee <span className="req">*</span></label>
            <select id="rec-employee" required><option value="">Select Employee</option></select>
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="rec-tasktype">Task Type <span className="optional">(Optional)</span></label>
            <select id="rec-tasktype">
              <option value="">Select Task Type</option>
              <option value="__add_new__">+ Add new task type…</option>
            </select>
            <div id="recNewTaskTypeRow" className="inline-add-row" hidden={true}>
              <input type="text" id="recNewTaskTypeInput" placeholder="New task type name…" />
              <button type="button" id="recNewTaskTypeSave" className="primary-btn primary-btn-inline">Add</button>
              <button type="button" id="recNewTaskTypeCancel" className="ghost-btn-text">Cancel</button>
            </div>
            <p id="recTaskTypeMsg" className="form-error" hidden={true}></p>
          </div>
          <div className="field">
            <label htmlFor="rec-project">Project <span className="optional">(Optional)</span></label>
            <select id="rec-project"><option value="">Select Project</option></select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="rec-description">Task Description <span className="req">*</span></label>
          <textarea id="rec-description" rows={3} placeholder="Describe the recurring task" required></textarea>
        </div>
        <div className="field" hidden={true}>
          <label htmlFor="rec-priority">Priority</label>
          <select id="rec-priority">
            <option value="Low">Low</option>
            <option value="Medium" defaultSelected>Medium</option>
            <option value="High">High</option>
          </select>
        </div>

        {/* Frequency selector */}
        <div className="field">
          <label>Frequency <span className="req">*</span></label>
          <div className="freq-grid">
            <button type="button" className="freq-btn" data-freq="Daily"><strong>Daily</strong><small>Every day</small></button>
            <button type="button" className="freq-btn" data-freq="Weekly"><strong>Weekly</strong><small>Every week</small></button>
            <button type="button" className="freq-btn" data-freq="Monthly"><strong>Monthly</strong><small>Every month</small></button>
            <button type="button" className="freq-btn" data-freq="Yearly"><strong>Yearly</strong><small>Every year</small></button>
          </div>
        </div>

        {/* Weekly day selector */}
        <div className="field" id="weeklyDaysField" hidden={true}>
          <label>Select Days <span className="req">*</span></label>
          <div className="days-grid">
            <label className="day-check"><input type="checkbox" defaultValue="0" /> Sun</label>
            <label className="day-check"><input type="checkbox" defaultValue="1" /> Mon</label>
            <label className="day-check"><input type="checkbox" defaultValue="2" /> Tue</label>
            <label className="day-check"><input type="checkbox" defaultValue="3" /> Wed</label>
            <label className="day-check"><input type="checkbox" defaultValue="4" /> Thu</label>
            <label className="day-check"><input type="checkbox" defaultValue="5" /> Fri</label>
            <label className="day-check"><input type="checkbox" defaultValue="6" /> Sat</label>
          </div>
        </div>

        {/* Active period */}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="rec-start">Start Date <span className="req">*</span></label>
            <input id="rec-start" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="rec-end">End Date <span className="optional">(optional)</span></label>
            <input id="rec-end" type="date" />
          </div>
        </div>

        {/* Checkpoints */}
        <div className="field">
          <label>Checkpoints <span className="optional">(optional)</span></label>
          <p className="form-note">Employee must tick all checkpoints before the task is marked done.</p>
          <div id="checkpointsList"></div>
          <button type="button" id="addCheckpointBtn" className="ghost-btn-text" style={{marginTop: 8}}>+ Add checkpoint</button>
        </div>

        <p id="recurringFormMsg" className="form-error" hidden={true}></p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn-text" id="cancelRecurringModal">Cancel</button>
          <button type="button" id="saveRecurringBtn" className="primary-btn primary-btn-inline">Create Recurring Task</button>
        </div>
      </div>
    </div>
  </div>

  
    </>
  );
}
