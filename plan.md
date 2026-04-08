Plan for Admin Dashboard Redesign:
1. State changes:
   - Add `adminActiveTab` state: 'settings' | 'builder' | 'submissions'
2. Structural changes:
   - `<main className="admin-layout">`
     - `<aside className="admin-sidebar">` (contains nav links for tabs)
     - `<section className="admin-content">` (contains the active tab content)
3. Content restructuring:
   - Tab 'settings': Render Event Settings form and Poster upload in a cleaner layout (single column or two column if large screen).
   - Tab 'builder': Render Form Builder. Update card design.
   - Tab 'submissions': Render Submissions data in a Table format instead of list of cards for better data density and professional look.
4. CSS updates:
   - Add classes for `admin-sidebar`, `admin-nav-btn`, `admin-content`, `data-table`, `table-wrapper`.
   - Update `.admin-layout` to `grid-template-columns: 260px 1fr`.
