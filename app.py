import streamlit as st
from pathlib import Path
from datetime import datetime
from services import UserService, SessionService
import pages.counter
import pages.entry
import pages.office
import pages.admin
import pages.dashboard

st.set_page_config(
    page_title="Physical Inventory",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Create uploads directory
Path("uploads").mkdir(exist_ok=True)

def init_session():
    if "user" not in st.session_state:
        st.session_state.user = None
        st.session_state.role = None
        st.session_state.session_id = None

init_session()

def login_page():
    st.title("Physical Inventory System")
    col1, col2, col3 = st.columns([1, 2, 1])

    with col2:
        st.markdown("---")
        username = st.text_input("Username", placeholder="Enter your username")

        if st.button("Login", use_container_width=True):
            if username.strip():
                user = UserService.get_user(username)
                if user:
                    st.session_state.user = user['username']
                    st.session_state.role = user['role']
                    st.session_state.session_id = st.session_state.get('session_id')
                    st.rerun()
                else:
                    st.error("User not found. Please contact your administrator.")
            else:
                st.error("Please enter a username")

def main_app():
    with st.sidebar:
        st.title("📦 Physical Inventory")
        st.markdown(f"**User:** {st.session_state.user}")
        st.markdown(f"**Role:** {st.session_state.role.capitalize()}")

        if st.button("Logout", use_container_width=True):
            st.session_state.user = None
            st.session_state.role = None
            st.session_state.session_id = None
            st.rerun()

        st.markdown("---")

        # Session selection (visible to all roles)
        sessions = SessionService.list_sessions()
        open_sessions = [s for s in sessions if s['status'] == 'open']

        if open_sessions:
            session_names = {f"{s['id']}: {s['name']}": s['id'] for s in open_sessions}
            selected = st.selectbox(
                "Active Session",
                options=list(session_names.keys()),
                key="session_selector"
            )
            if selected:
                st.session_state.session_id = session_names[selected]
        else:
            st.warning("No open sessions")
            st.session_state.session_id = None

        st.markdown("---")

        # Navigation based on role
        st.markdown("### Navigation")

        if st.session_state.role == "counter":
            pages_list = {
                "Counter": pages.counter,
                "Dashboard": pages.dashboard,
            }
        elif st.session_state.role == "admin":
            pages_list = {
                "Counter": pages.counter,
                "Entry": pages.entry,
                "Office": pages.office,
                "Admin": pages.admin,
                "Dashboard": pages.dashboard,
            }
        else:
            pages_list = {}

        if "current_page" not in st.session_state:
            st.session_state.current_page = list(pages_list.keys())[0] if pages_list else None

        for page_name in pages_list:
            if st.button(page_name, use_container_width=True):
                st.session_state.current_page = page_name
                st.rerun()

    # Render current page
    if st.session_state.role == "counter":
        pages_dict = {
            "Counter": pages.counter,
            "Dashboard": pages.dashboard,
        }
    elif st.session_state.role == "admin":
        pages_dict = {
            "Counter": pages.counter,
            "Entry": pages.entry,
            "Office": pages.office,
            "Admin": pages.admin,
            "Dashboard": pages.dashboard,
        }
    else:
        pages_dict = {}

    current_page = st.session_state.current_page
    if current_page and current_page in pages_dict:
        pages_dict[current_page].render()
    else:
        st.error("Page not found")

if st.session_state.user:
    main_app()
else:
    login_page()
