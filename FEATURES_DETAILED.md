# GPS Mobile Detailed Documentation

This document maps the current Expo mobile app in `GPS-MOBILE` feature by feature.
It is based on the actual app shell, panels, API client, and session storage code.

## 1. Product Scope

`GPS-MOBILE` is the mobile companion for Star Public School.

- Teacher workflows
- Student workflows
- Role-based login and routing
- Attendance, GPS attendance, leave, marks, holidays, fee, results, and notifications
- Local session persistence with auto refresh for teacher tokens

## 2. Core Files

- `App.js` drives login, session restore, role routing, tabs, and all teacher/student panels.
- `src/api/client.js` contains every mobile API wrapper and shared request handling.
- `src/storage/session.js` stores the signed-in session in AsyncStorage.
- `src/utils/date.js` provides date helpers used across the UI.
- `src/components/student/*` contains the student-specific panels.

## 3. Runtime Behavior

### 3.1 App startup

- The app restores the last session from AsyncStorage key `sps_mobile_session`.
- While booting, it shows the splash/loading screen.
- If the saved session is missing or invalid, the login screen is shown.
- If the session belongs to a student and `mustResetPassword` is true, the password setup screen is shown before the dashboard.

### 3.2 Session persistence

- `loadSession()` reads the saved session JSON.
- `saveSession()` updates the stored session after login, token refresh, or password setup.
- `clearSession()` removes the session on logout.

### 3.3 Teacher token refresh

- Teacher sessions carry both an access token and refresh token.
- The app refreshes the token automatically when it is close to expiry.
- It also refreshes again when the app becomes active after being backgrounded.
- The API client can replay a request once after a 401 if refresh succeeds.

### 3.4 API base URL

- In development, the default backend is `http://localhost:5000`.
- In production, the default backend is `https://starpublicschool.onrender.com`.
- `EXPO_PUBLIC_API_BASE_URL` overrides the base URL.

## 4. Authentication and Account Setup

### 4.1 Teacher login

- Uses `/api/auth/login`
- Login identity is email
- Password is masked
- Successful login stores:
  - role
  - access token
  - refresh token
  - token expiry
  - user payload

### 4.2 Student login

- Uses `/api/student-auth/login`
- Login identity is username
- Password field accepts DOB/password style credential
- Successful login stores:
  - role
  - access token
  - refresh token if returned
  - user payload
  - `mustResetPassword` flag

### 4.3 Mandatory student password setup

- If backend returns `must_reset_password`, the app redirects to the password setup screen.
- The student must enter a new password and confirm it.
- Validation rules:
  - both fields required
  - minimum length 6
  - passwords must match
- On success, the app updates the session and unlocks the dashboard.

## 5. Navigation Model

### 5.1 Teacher navigation

The teacher dashboard uses section tabs and a bottom dock.

- Home
- Attendance
  - Check In/Out
  - Add Attendance
  - Students
  - Holidays
- Marks
  - Submit Marks
  - View Marks
- Reports
  - My History
  - History
  - Reports

### 5.2 Student navigation

The student dashboard uses section tabs and a bottom dock.

- Home
- Attendance
- Leave Apply
- Holidays
- Fee
- Results
- Profile entry is available from the avatar button on the header

## 6. Teacher Features

### 6.1 Teacher Home

Purpose:

- Show the teacher workspace summary for the assigned class and section.

Behavior:

- Loads the current class assignment from the attendance bootstrap API.
- Displays the assigned class, section, and academic year.
- Shows summary metrics:
  - students count
  - present count
  - absent count
  - late count
- Shows shortcuts to the teacher features.

### 6.2 Assigned Class Bootstrap

Purpose:

- Discover the teacher's assigned class and section before showing attendance and marks screens.

Behavior:

- Calls `/api/attendance/bootstrap`
- Chooses the first assignment if the user has more than one.
- Uses assignment values to scope:
  - student list
  - attendance records
  - subject list
  - reports
  - marks submission and marks viewing

### 6.3 Teacher Student List

Purpose:

- Show students from the assigned class/section.

Behavior:

- Student list comes from `/api/students` using assignment scope.
- Each row shows:
  - student name
  - roll number
  - class and section
  - mobile number if available
  - fee status badge
- Fee status is derived from fee backend data and `previousDue`.

### 6.4 Class Attendance Marker

Purpose:

- Mark daily attendance for the assigned class.

Behavior:

- Date is shown in read-only form.
- The teacher chooses one status per student:
  - Present
  - Absent
  - Late
- Statuses are prefilled from existing records when available.
- Attendance cannot be saved until every student has a status.
- If the selected date is a holiday, saving is blocked and the UI explains that no attendance will be recorded.
- Save action sends the selected date, assignment scope, and status map to `/api/attendance/records` with POST.

### 6.5 Holiday-Aware Attendance

Purpose:

- Prevent attendance entry on a holiday.

Behavior:

- The attendance API response can mark the selected date as a holiday.
- The UI disables attendance selection and save in that case.
- A holiday notice is shown to the teacher.

### 6.6 Reports Panel

Purpose:

- Show class attendance report for a selected month.

Behavior:

- Loads monthly records using `/api/attendance/records`.
- Uses the assignment scope and selected month.
- Shows:
  - present
  - absent
  - late
  - attendance percentage
- Record list is rendered with student mapping when available.

### 6.7 Student History Panel

Purpose:

- Review attendance history for any student in the assigned class.

Behavior:

- Loads student-specific attendance using `/api/attendance/students/:studentId`.
- Student can be switched from the dropdown.
- Month filter supports:
  - all months
  - a specific month
- Shows:
  - present count
  - absent count
  - late count
  - attendance percentage
- Also shows month-wise summaries and the record list for the selected month.

### 6.8 Teacher GPS Attendance

Purpose:

- Let the teacher mark personal attendance using GPS validation.

Behavior:

- Loads today's teacher attendance and leave requests.
- Shows the current attendance status and school location settings.
- Check-in and check-out are only enabled when the relevant prerequisites are met.
- Location permission is requested from Expo Location.
- Device location is read with highest accuracy.
- The payload includes:
  - date
  - latitude
  - longitude
  - location accuracy
  - device id

Important safeguards:

- If location permission is denied, attendance cannot be marked.
- If location services are off, the app shows a clear error.
- If school location settings are missing, the UI warns the user.
- Check-out is blocked until check-in exists.
- Check-in is blocked after it has already been recorded.
- Check-out is blocked after it has already been recorded.

### 6.9 Checkout Missing Handling

Purpose:

- Allow the teacher to explain a missing checkout.

Behavior:

- If the backend returns a pending checkout request, the app shows it at the top.
- The teacher must choose a reason and optionally add remarks.
- If the reason is `Other`, remarks become required.
- The explanation is submitted to the checkout explanation endpoint.

### 6.10 Teacher Leave Request

Purpose:

- Allow teachers to apply for leave from the mobile app.

Behavior:

- Leave form fields:
  - leave type
  - from date
  - to date
  - reason
- Reason is mandatory.
- Submitted leaves are shown in the leave status list.
- The leave status list shows:
  - pending
  - approved
  - rejected

### 6.11 Teacher Attendance History

Purpose:

- Show monthly and yearly attendance history for the teacher.

Behavior:

- Loads records from `/api/teacher-attendance/records`.
- Year is editable.
- Month filter is derived from the loaded records.
- Summary cards show:
  - working days
  - present
  - late
  - half day
  - absent
  - leave
  - checkout missing
  - record count
- Monthly breakdown rows are tappable and update the selected month.
- Year summary rows show year-level totals.

### 6.12 Teacher Marks Submission

Purpose:

- Enter terminal marks for students in the assigned class.

Behavior:

- Terminal selector:
  - First
  - Second
  - Third
  - Annual
- Student selector is a dropdown populated from assigned class students.
- Roll number is editable.
- Subjects are loaded with `/api/subjects/class/:class` and section fallback when needed.
- Marks are entered per subject:
  - external marks
  - internal marks when allowed

Validation rules:

- Drawing subjects use:
  - external max 50
  - no internal marks
- Other subjects use:
  - external max 80
  - internal max 20
- At least one subject must have a non-zero mark before submit.
- Submission payload includes:
  - class
  - section
  - academic year
  - terminal
  - roll number
  - marks list

### 6.13 Teacher Marks Viewing

Purpose:

- Review submitted marks by terminal.

Behavior:

- Uses `/api/marks` with class, section, and terminal.
- Shows student-level cards with:
  - total marks
  - submitted/pending status
- Includes filters:
  - all
  - submitted
  - pending
- Each student card can expand to show subject-level marks and status.

### 6.14 Teacher Holiday Calendar and Leave Review

Purpose:

- See holidays and review student leave requests.

Behavior:

- Holiday calendar is month-based.
- Teacher can switch between:
  - Holidays
  - Leave Requests
- Holiday view uses `/api/attendance/holidays`.
- Leave requests view uses `/api/student-leaves/admin`.
- Leave requests can be approved or rejected.
- Holiday rows show:
  - title
  - date or date range
  - description if present
  - weekly off or admin badge

## 7. Student Features

### 7.1 Student Home

Purpose:

- Show a student-facing overview of attendance and notifications.

Behavior:

- Displays:
  - student name
  - class
  - section
  - roll number
- Shows attendance summary cards:
  - attendance percentage
  - present
  - absent
  - late
- Loads the notification feed preview below the summary.

### 7.2 Student Attendance

Purpose:

- Let the student review attendance records.

Behavior:

- Displays summary cards for:
  - present
  - absent
- Shows the record list.
- Attendance rows are date-based and status-based.

### 7.3 Student Leave Apply

Purpose:

- Allow students to submit leave requests.

Behavior:

- Leave type selector includes:
  - Sick Leave
  - Family Work
  - Function
  - Other
- Fields:
  - from date
  - to date
  - reason
- Validation:
  - from date required
  - to date required
  - reason required
- Submission posts to `/api/student-leaves`.
- Submitted requests are shown immediately in the list.
- Each request shows:
  - leave type
  - date range
  - reason
  - admin remarks if any
  - current status

### 7.4 Student Holidays

Purpose:

- Show the monthly holiday calendar to students.

Behavior:

- Students can only see the holiday view, not the leave-request review tab.
- Holidays are loaded by month.
- Each holiday row shows:
  - title
  - date or date range
  - description if present
  - Friday badge for weekly off entries

### 7.5 Student Fee Dashboard

Purpose:

- Show fee status, bills, and payment history for the student.

Behavior:

- Year selector is shown as chips.
- Dashboard loads from `/api/student-fees/me`.
- Summary cards show:
  - total billed
  - total paid
  - due
  - bills count
- Bill history includes:
  - invoice number
  - month
  - bill status
  - billed amount
  - paid amount
  - due amount
  - advance used
  - latest payment details
  - itemized fee heads
- Payment history is shown as a separate feed.
- If payment history is not returned directly, the panel derives it from bill payment entries.

### 7.6 Student Results

Purpose:

- Show published exam results by terminal.

Behavior:

- Checks result availability first using `/api/results/availability`.
- Terminals:
  - First
  - Second
  - Third
  - Annual
- Locked terminals cannot be opened.
- When a terminal is not published, the UI shows a locked message instead of calling the result endpoint.
- When published, result data is loaded from `/api/results`.
- Shows:
  - total marks
  - obtained marks
  - percentage
  - division
  - rank
  - published date
  - term summary
  - subject marks

### 7.7 Student Notifications

Purpose:

- Show fee-related notifications and invoice updates.

Behavior:

- Notification feed is split into:
  - Bills
  - Invoices
- Loads from `/api/student-notifications/me` with pagination.
- Shows unread count for the visible feed.
- Supports refresh and load more.
- Supports expand/collapse for bill notifications.
- Shows:
  - title
  - type
  - source type
  - body
  - due amount when present
  - payment instructions when present
  - notification details like month, student, class, mode, receipt, and transaction
- Tapping a notification marks it as read using the read endpoint.

### 7.8 Student Profile View

Purpose:

- Give the student a detailed personal profile view.

Behavior:

- Accessible from the header avatar button.
- Shows:
  - identity data
  - academic data
  - family data
  - contact data
  - admission data
- Includes a logout action.

## 8. API Surface

### 8.1 Authentication

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/student-auth/login`
- `POST /api/student-auth/set-password`

### 8.2 Attendance

- `GET /api/attendance/bootstrap`
- `GET /api/students`
- `GET /api/attendance/records`
- `POST /api/attendance/records`
- `GET /api/attendance/holidays`
- `GET /api/attendance/students/:studentId`

### 8.3 Marks and Results

- `GET /api/subjects/class/:class`
- `POST /api/marks/submit`
- `GET /api/marks`
- `GET /api/results`
- `GET /api/results/availability`

### 8.4 Student Leaves

- `GET /api/student-leaves/me`
- `POST /api/student-leaves`
- `GET /api/student-leaves/admin`
- `PATCH /api/student-leaves/admin/:requestId`

### 8.5 Student Notifications

- `POST /api/student-notifications/register-token`
- `GET /api/student-notifications/me`
- `PATCH /api/student-notifications/:notificationId/read`

### 8.6 Student Fees

- `GET /api/student-fees/me`

### 8.7 Teacher GPS Attendance

- `GET /api/teacher-attendance/today`
- `GET /api/teacher-attendance/records`
- `POST /api/teacher-attendance/check-in`
- `POST /api/teacher-attendance/check-out`
- `POST /api/teacher-attendance/checkout-explanations/:attendanceId`
- `POST /api/teacher-attendance/leave-requests`
- `GET /api/teacher-attendance/leave-requests`

## 9. Shared Rules and Edge Cases

### 9.1 Error normalization

- Network failures are converted into a friendly backend connection message.
- Invalid credentials become a clear wrong username/password message.
- Token or session problems become a session expired message.
- Missing teacher assignment becomes an assignment warning.

### 9.2 Student push notifications

- Student devices request push permission on mobile.
- If granted, Expo push token is registered with the backend.
- The push registration payload includes:
  - push token
  - platform
  - device id

### 9.3 Attendance and marks constraints

- Teacher attendance cannot be saved if a holiday is selected.
- Marks submission cannot happen without:
  - valid assignment
  - terminal
  - roll number
  - at least one entered mark
- Marks submission enforces subject-level max marks rules.

### 9.4 Hidden academic year handling

- Academic year is often used in API payloads even when the UI does not show it prominently.
- The mobile app falls back to a default academic year when assignment data is missing it.

## 10. Useful Implementation Notes

- The app is fully role aware and changes its screen structure based on the logged-in role.
- Teacher and student flows share the same shell but use different tab sets.
- The mobile app is not just a thin login screen; it contains the full operational workflows used daily by teachers and students.
- Most screens are read-heavy but still support important writes:
  - attendance save
  - GPS check-in/check-out
  - leave submit
  - leave review
  - marks submit
  - password setup
  - notification read state

## 11. Summary Of Feature Coverage

- Login and session restore
- Teacher token refresh
- Teacher assignment bootstrap
- Teacher student list
- Teacher class attendance
- Teacher GPS attendance
- Teacher checkout explanation
- Teacher leave request
- Teacher attendance history
- Teacher reports
- Student attendance history
- Student leave application
- Holiday calendar
- Fee dashboard
- Results
- Notifications
- Student profile
- Mandatory first-login password setup

