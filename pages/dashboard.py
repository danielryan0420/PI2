import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
from services import SessionService, CountService, DashboardService

def render():
    st.title("📊 Dashboard")

    if not st.session_state.session_id:
        st.warning("Please select an active session from the sidebar")
        return

    session_id = st.session_state.session_id
    session = SessionService.get_session(session_id)

    if not session:
        st.error("Session not found")
        return

    st.subheader(f"Session: {session['name']}")
    st.caption(f"Status: {session['status'].upper()} | Created: {session['created_at']}")

    # Summary metrics
    summary = DashboardService.get_session_summary(session_id)

    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric("Total Counts", summary.get('total_counts', 0))

    with col2:
        st.metric("Verified", summary.get('verified_counts', 0))

    with col3:
        st.metric("Flagged", summary.get('flagged_counts', 0))

    with col4:
        st.metric("Unique Counters", summary.get('unique_counters', 0))

    with col5:
        st.metric("Unique Materials", summary.get('unique_materials', 0))

    st.markdown("---")

    tabs = st.tabs(["Material Summary", "Counter Summary", "Discrepancies", "Status Distribution"])

    # Material Summary
    with tabs[0]:
        st.subheader("Material Count Summary")

        material_data = DashboardService.get_material_summary(session_id)

        if material_data:
            df_data = []
            for m in material_data:
                df_data.append({
                    'Material': m['material_number'],
                    'Count Frequency': m['count_frequency'],
                    'Total Quantity': m['total_quantity'],
                    'Avg Quantity': round(m['avg_quantity'], 2) if m['avg_quantity'] else 0,
                    'Counted By': m['counted_by'] or '-'
                })

            df = pd.DataFrame(df_data)
            st.dataframe(df, use_container_width=True, hide_index=True)

            # Charts
            col1, col2 = st.columns(2)

            with col1:
                top_materials = df.nlargest(10, 'Count Frequency')
                fig, ax = plt.subplots(figsize=(10, 5))
                ax.barh(top_materials['Material'], top_materials['Count Frequency'])
                ax.set_xlabel("Count Frequency")
                ax.set_title("Top 10 Most Counted Materials")
                st.pyplot(fig)

            with col2:
                top_quantity = df.nlargest(10, 'Total Quantity')
                fig, ax = plt.subplots(figsize=(10, 5))
                ax.barh(top_quantity['Material'], top_quantity['Total Quantity'])
                ax.set_xlabel("Total Quantity")
                ax.set_title("Top 10 Highest Quantity Materials")
                st.pyplot(fig)
        else:
            st.info("No material data available")

    # Counter Summary
    with tabs[1]:
        st.subheader("Counter Performance")

        user_data = DashboardService.get_user_summary(session_id)

        if user_data:
            df_data = []
            for u in user_data:
                df_data.append({
                    'Counter': u['username'],
                    'Total Counts': u['total_counts'],
                    'Verified': u['verified_counts'],
                    'Unique Materials': u['unique_materials'],
                    'Verification Rate': f"{(u['verified_counts'] / u['total_counts'] * 100):.1f}%" if u['total_counts'] > 0 else "0%"
                })

            df = pd.DataFrame(df_data)
            st.dataframe(df, use_container_width=True, hide_index=True)

            # Chart
            fig, ax = plt.subplots(figsize=(10, 5))
            ax.bar(df['Counter'], df['Total Counts'], label='Total Counts')
            ax.bar(df['Counter'], df['Verified'], label='Verified', alpha=0.7)
            ax.set_ylabel("Count")
            ax.set_title("Counts by Counter")
            ax.legend()
            plt.xticks(rotation=45, ha='right')
            st.pyplot(fig)
        else:
            st.info("No counter data available")

    # Discrepancies
    with tabs[2]:
        st.subheader("Potential Discrepancies")

        discrepancies = DashboardService.get_discrepancies(session_id)

        if discrepancies:
            df_data = []
            for d in discrepancies:
                df_data.append({
                    'Count ID': d['id'],
                    'Material': d['material_number'],
                    'Counted': d['counted_quantity'],
                    'SAP Quantity': d['sap_quantity'] or '-',
                    'Variance': round(d['variance'], 2) if d['variance'] else 0,
                    'Counter': d['username'],
                    'Status': d['status'].upper()
                })

            df = pd.DataFrame(df_data)

            # Sort by variance descending
            df = df.sort_values('Variance', ascending=False)

            st.dataframe(df, use_container_width=True, hide_index=True)

            # High variance filter
            st.subheader("High Variance Counts (>10% difference)")
            high_variance = df[df['Variance'] > 10]
            if not high_variance.empty:
                st.warning(f"Found {len(high_variance)} counts with high variance")
                st.dataframe(high_variance, use_container_width=True, hide_index=True)
            else:
                st.success("No high variance counts")
        else:
            st.info("No discrepancy data available (SAP snapshot not loaded)")

    # Status Distribution
    with tabs[3]:
        st.subheader("Count Status Distribution")

        counts = CountService.list_counts(session_id)

        if counts:
            status_counts = {}
            for count in counts:
                status = count['status']
                status_counts[status] = status_counts.get(status, 0) + 1

            col1, col2 = st.columns(2)

            with col1:
                fig, ax = plt.subplots(figsize=(8, 6))
                ax.pie(status_counts.values(), labels=status_counts.keys(), autopct='%1.1f%%', startangle=90)
                ax.set_title("Count Status Distribution")
                st.pyplot(fig)

            with col2:
                df_status = pd.DataFrame(list(status_counts.items()), columns=['Status', 'Count'])
                st.dataframe(df_status, use_container_width=True, hide_index=True)
        else:
            st.info("No count data available")
