import streamlit as st
import pandas as pd
from services import SessionService, UserService, CountService, AuditService

def render():
    st.title("⚙️ Admin")

    tabs = st.tabs(["Sessions", "Users", "Audit Log"])

    # Sessions
    with tabs[0]:
        st.subheader("Session Management")

        col1, col2 = st.columns([3, 1])

        with col1:
            session_name = st.text_input("New Session Name")

        with col2:
            st.write("")  # Spacer
            if st.button("Create Session", use_container_width=True):
                if not session_name:
                    st.error("Session name is required")
                else:
                    try:
                        session_id = SessionService.create_session(session_name)
                        st.success(f"✓ Session '{session_name}' created (ID: {session_id})")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {str(e)}")

        st.markdown("---")
        st.subheader("All Sessions")

        sessions = SessionService.list_sessions()

        if sessions:
            for session in sessions:
                col1, col2, col3 = st.columns([2, 1, 1])

                with col1:
                    st.write(f"**{session['name']}** (ID: {session['id']})")
                    st.caption(f"Created: {session['created_at']}")

                with col2:
                    status_color = "🟢" if session['status'] == 'open' else "🔴"
                    st.write(f"{status_color} {session['status'].upper()}")

                with col3:
                    if session['status'] == 'open':
                        if st.button("Close", key=f"close_{session['id']}"):
                            SessionService.close_session(session['id'])
                            st.success("✓ Session closed")
                            st.rerun()

                # Session stats
                stats = SessionService.get_session_stats(session['id'])
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Total Counts", stats.get('total', 0))
                with col2:
                    st.metric("Verified", stats.get('verified', 0))
                with col3:
                    pass

                st.divider()

        else:
            st.info("No sessions found")

    # Users
    with tabs[1]:
        st.subheader("User Management")

        col1, col2, col3 = st.columns(3)

        with col1:
            username = st.text_input("Username")

        with col2:
            role = st.selectbox("Role", ["counter", "office", "admin"])

        with col3:
            st.write("")  # Spacer
            if st.button("Create User", use_container_width=True):
                if not username:
                    st.error("Username is required")
                else:
                    try:
                        user = UserService.get_user(username)
                        if user:
                            # Update role
                            UserService.update_user_role(username, role)
                            st.success(f"✓ User {username} role updated to {role}")
                        else:
                            # Create new
                            UserService.create_user(username, role)
                            st.success(f"✓ User {username} created with role {role}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {str(e)}")

        st.markdown("---")
        st.subheader("All Users")

        users = UserService.list_users()

        if users:
            df_data = []
            for user in users:
                df_data.append({
                    'Username': user['username'],
                    'Role': user['role'].upper(),
                    'Created': user['created_at']
                })

            df = pd.DataFrame(df_data)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No users found")

    # Audit Log
    with tabs[2]:
        st.subheader("Audit Log")

        if not st.session_state.session_id:
            st.warning("Please select a session to view audit logs")
        else:
            session_id = st.session_state.session_id

            col1, col2 = st.columns(2)

            with col1:
                event_filter = st.selectbox(
                    "Filter by event type",
                    ["All", "create", "edit", "verify", "flag"]
                )

            with col2:
                editor_filter = st.text_input("Filter by editor (optional)")

            audit_logs = AuditService.get_session_audit(session_id)

            if audit_logs:
                # Apply filters
                filtered_logs = audit_logs
                if event_filter != "All":
                    filtered_logs = [l for l in filtered_logs if l['event_type'] == event_filter]
                if editor_filter:
                    filtered_logs = [l for l in filtered_logs if editor_filter.lower() in l['editor_username'].lower()]

                df_data = []
                for log in filtered_logs:
                    df_data.append({
                        'Count ID': log['count_id'],
                        'Event': log['event_type'].upper(),
                        'Editor': log['editor_username'],
                        'Field': log['field_name'] or '-',
                        'Old Value': log['old_value'] or '-',
                        'New Value': log['new_value'] or '-',
                        'Reason': log['reason'] or '-',
                        'Time': log['created_at']
                    })

                df = pd.DataFrame(df_data)
                st.dataframe(df, use_container_width=True, hide_index=True)

                # Export button
                csv = df.to_csv(index=False)
                st.download_button(
                    "Download Audit Log",
                    csv,
                    "audit_log.csv",
                    "text/csv"
                )
            else:
                st.info("No audit entries found for this session")
