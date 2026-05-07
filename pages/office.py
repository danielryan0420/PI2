import streamlit as st
import pandas as pd
from services import SlocConfigService, MaterialService, WmBinService, CountService

def render():
    st.title("🏢 Office")

    tabs = st.tabs(["SLOC Config", "Materials", "WM Bins"])

    # SLOC Configuration
    with tabs[0]:
        st.subheader("SLOC Configuration")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            sloc = st.text_input("SLOC Code").upper()

        with col2:
            description = st.text_input("Description")

        with col3:
            wm_enabled = st.checkbox("Enable WM Bins")

        with col4:
            im_enabled = st.checkbox("Enable ZBIN")

        if st.button("Create SLOC", use_container_width=True):
            if not sloc:
                st.error("SLOC code is required")
            else:
                try:
                    SlocConfigService.create_sloc(
                        sloc=sloc,
                        description=description,
                        wm_enabled=wm_enabled,
                        im_enabled=im_enabled
                    )
                    st.success(f"✓ SLOC {sloc} created")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {str(e)}")

        st.markdown("---")
        st.subheader("Existing SLOCs")

        slocs = SlocConfigService.list_slocs()

        if slocs:
            df_data = []
            for s in slocs:
                df_data.append({
                    'SLOC': s['sloc'],
                    'Description': s['description'] or '-',
                    'WM Bins': '✓' if s['wm_enabled'] else '✗',
                    'ZBIN': '✓' if s['im_enabled'] else '✗'
                })

            df = pd.DataFrame(df_data)
            st.dataframe(df, use_container_width=True, hide_index=True)

            # Delete functionality
            col1, col2 = st.columns([3, 1])
            with col1:
                sloc_to_delete = st.selectbox("Delete SLOC", options=[s['sloc'] for s in slocs], key="delete_sloc")

            with col2:
                if st.button("Delete", key="delete_sloc_btn"):
                    SlocConfigService.delete_sloc(sloc_to_delete)
                    st.success(f"✓ SLOC {sloc_to_delete} deleted")
                    st.rerun()
        else:
            st.info("No SLOCs configured yet")

    # Materials
    with tabs[1]:
        st.subheader("Material Master")

        col1, col2, col3 = st.columns(3)

        with col1:
            mat_number = st.text_input("Material Number").upper()

        with col2:
            mat_desc = st.text_input("Description")

        with col3:
            mat_uom = st.text_input("Base UOM")

        if st.button("Create/Update Material", use_container_width=True):
            if not mat_number:
                st.error("Material number is required")
            else:
                try:
                    MaterialService.create_or_update_material(
                        material_number=mat_number,
                        description=mat_desc,
                        base_uom=mat_uom
                    )
                    st.success(f"✓ Material {mat_number} updated")
                except Exception as e:
                    st.error(f"Error: {str(e)}")

        st.markdown("---")
        st.subheader("Search Materials")

        search_query = st.text_input("Search by material number or description")

        if search_query:
            materials = MaterialService.search_materials(search_query)

            if materials:
                df_data = []
                for m in materials:
                    df_data.append({
                        'Material Number': m['material_number'],
                        'Description': m['description'] or '-',
                        'UOM': m['base_uom'] or '-',
                        'Type': m['material_type'] or '-',
                        'Group': m['material_group'] or '-'
                    })

                df = pd.DataFrame(df_data)
                st.dataframe(df, use_container_width=True, hide_index=True)
            else:
                st.info("No materials found")

    # WM Bins
    with tabs[2]:
        st.subheader("WM Bin Management")

        sloc_configs = SlocConfigService.list_slocs()
        slocs_with_wm = [s for s in sloc_configs if s['wm_enabled']]

        if not slocs_with_wm:
            st.warning("No SLOCs with WM Bins enabled")
        else:
            col1, col2, col3, col4, col5 = st.columns(5)

            with col1:
                selected_sloc = st.selectbox(
                    "SLOC",
                    options=[s['sloc'] for s in slocs_with_wm]
                )

            with col2:
                bin_name = st.text_input("Bin Name").upper()

            with col3:
                storage_type = st.selectbox("Storage Type", ["100", "200"])

            with col4:
                bin_description = st.text_input("Description")

            with col5:
                st.write("")  # Spacer
                if st.button("Create Bin"):
                    if not bin_name:
                        st.error("Bin name is required")
                    else:
                        try:
                            bin_id = WmBinService.create_bin(
                                bin_name=bin_name,
                                storage_type=storage_type,
                                sloc=selected_sloc,
                                description=bin_description
                            )
                            st.success(f"✓ Bin {bin_name} created")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {str(e)}")

            st.markdown("---")
            st.subheader("Existing Bins")

            bins = WmBinService.list_bins(selected_sloc)

            if bins:
                df_data = []
                for b in bins:
                    df_data.append({
                        'Bin': b['bin'],
                        'Type': b['storage_type'],
                        'Description': b['description'] or '-',
                        'Created': b['created_at']
                    })

                df = pd.DataFrame(df_data)
                st.dataframe(df, use_container_width=True, hide_index=True)
            else:
                st.info(f"No bins for SLOC {selected_sloc}")
