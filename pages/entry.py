import streamlit as st
import pandas as pd
from io import BytesIO
from services import CountService, SessionService, SlocConfigService, MaterialService, AuditService
from datetime import datetime

def render():
    st.title("📝 Entry")

    if not st.session_state.session_id:
        st.warning("Please select an active session from the sidebar")
        return

    session_id = st.session_state.session_id
    username = st.session_state.user

    tabs = st.tabs(["Manual Entry", "Bulk Import", "View Counts"])

    with tabs[0]:
        st.subheader("Manual Count Entry")

        col1, col2 = st.columns(2)

        with col1:
            material_number = st.text_input("Material Number")
            quantity = st.number_input("Quantity", min_value=0.0, step=0.1)
            sloc_configs = SlocConfigService.list_slocs()
            sloc_options = {f"{s['sloc']} - {s['description'] or 'N/A'}": s['sloc'] for s in sloc_configs}
            sloc = st.selectbox("SLOC", options=list(sloc_options.keys()))

        with col2:
            wm_bin = st.text_input("WM Bin (optional)")
            zbin = st.text_input("ZBIN (optional)")
            counter_username = st.text_input("Counter Username (optional, defaults to you)")

        if st.button("Create Count", use_container_width=True, type="primary"):
            if not material_number or not quantity or not sloc:
                st.error("Please fill in required fields")
            else:
                try:
                    count_username = counter_username if counter_username else username
                    count_id = CountService.create_count(
                        session_id=session_id,
                        username=count_username,
                        material_number=material_number.upper(),
                        quantity=quantity,
                        sloc=sloc_options[sloc],
                        wm_bin=wm_bin.upper() if wm_bin else None,
                        zbin=zbin.upper() if zbin else None
                    )
                    st.success(f"✓ Count #{count_id} created")
                except Exception as e:
                    st.error(f"Error: {str(e)}")

    with tabs[1]:
        st.subheader("Bulk Import")

        uploaded_file = st.file_uploader("Upload Excel file with counts", type=["xlsx", "xls"])

        if uploaded_file:
            try:
                df = pd.read_excel(uploaded_file)
                st.dataframe(df, use_container_width=True)

                required_cols = ['material_number', 'quantity', 'sloc']
                if not all(col in df.columns for col in required_cols):
                    st.error(f"File must have columns: {', '.join(required_cols)}")
                else:
                    if st.button("Import Counts", type="primary"):
                        imported = 0
                        errors = 0

                        for idx, row in df.iterrows():
                            try:
                                CountService.create_count(
                                    session_id=session_id,
                                    username=row.get('username', username),
                                    material_number=str(row['material_number']).upper(),
                                    quantity=float(row['quantity']),
                                    sloc=str(row['sloc']),
                                    wm_bin=str(row.get('wm_bin', '')).upper() if row.get('wm_bin') else None,
                                    zbin=str(row.get('zbin', '')).upper() if row.get('zbin') else None
                                )
                                imported += 1
                            except Exception as e:
                                errors += 1
                                st.warning(f"Row {idx}: {str(e)}")

                        st.success(f"✓ Imported {imported} counts" + (f" ({errors} errors)" if errors else ""))

            except Exception as e:
                st.error(f"Error reading file: {str(e)}")

    with tabs[2]:
        st.subheader("View All Counts")

        col1, col2, col3 = st.columns(3)

        with col1:
            filter_username = st.text_input("Filter by username (leave blank for all)")

        with col2:
            filter_status = st.selectbox("Filter by status", ["All", "pending", "verified", "flagged"])

        with col3:
            filter_material = st.text_input("Filter by material")

        filters = {}
        if filter_username:
            filters['username'] = filter_username
        if filter_status != "All":
            filters['status'] = filter_status
        if filter_material:
            filters['material'] = filter_material

        counts = CountService.list_counts(session_id, filters)

        if counts:
            df_data = []
            for count in counts:
                df_data.append({
                    'ID': count['id'],
                    'Material': count['material_number'],
                    'Quantity': count['quantity'],
                    'SLOC': count['sloc'],
                    'WM Bin': count['wm_bin'] or '-',
                    'ZBIN': count['zbin'] or '-',
                    'Counter': count['username'],
                    'Status': count['status'],
                    'Created': count['created_at']
                })

            df = pd.DataFrame(df_data)
            st.dataframe(df, use_container_width=True, hide_index=True)

            # Export button
            excel_buffer = BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                df.to_excel(writer, index=False)
            excel_buffer.seek(0)

            st.download_button(
                "Download as Excel",
                excel_buffer,
                "counts.xlsx",
                "application/vnd.ms-excel"
            )
        else:
            st.info("No counts found")
