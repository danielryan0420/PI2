import streamlit as st
from datetime import datetime
from pathlib import Path
import os
import uuid
from services import CountService, SlocConfigService, MaterialService, PhotoService, AuditService, WmBinService

def render():
    st.title("📦 Counter")

    if not st.session_state.session_id:
        st.warning("Please select an active session from the sidebar")
        return

    session_id = st.session_state.session_id
    username = st.session_state.user

    # Get SLOC configurations
    sloc_configs = SlocConfigService.list_slocs()
    if not sloc_configs:
        st.error("No SLOC configurations found. Please set up SLOCs in the Office page.")
        return

    sloc_options = {f"{s['sloc']} - {s['description'] or 'No description'}": s for s in sloc_configs}

    # Initialize form state
    if "count_form" not in st.session_state:
        st.session_state.count_form = {
            "material_number": "",
            "quantity": "",
            "sloc": None,
            "wm_bin": "",
            "zbin": "",
            "notes": "",
            "photos": []
        }

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("Count Entry")

        # Material Number with scan button
        col_mat_input, col_mat_scan = st.columns([4, 1])
        with col_mat_input:
            material_number = st.text_input(
                "Material Number",
                value=st.session_state.count_form["material_number"],
                key="material_input",
                placeholder="e.g. 100-00001 or scan"
            )
            st.session_state.count_form["material_number"] = material_number.upper() if material_number else ""

        with col_mat_scan:
            if st.button("📷 Scan", key="scan_material", help="Scan barcode with camera"):
                st.session_state.show_camera = "material"

        # Show camera modal if requested
        if st.session_state.get("show_camera") == "material":
            st.info("Barcode scanning requires a compatible browser with camera access. Use the camera to scan the material barcode.")
            # Note: For production, you'd embed a proper barcode scanner component using html5-qrcode.js
            # For now, we'll just have the text input as fallback

        # Material lookup
        if material_number and len(material_number) >= 3:
            material = MaterialService.get_material(material_number)
            if material:
                st.success(f"✓ {material.get('description', 'N/A')}")
            else:
                st.warning("Material not found in master data")

        # SLOC selection
        selected_sloc = st.selectbox(
            "SLOC",
            options=list(sloc_options.keys()),
            index=0
        )
        sloc_config = sloc_options[selected_sloc]
        st.session_state.count_form["sloc"] = sloc_config['sloc']

        # Conditionally show WM Bin and ZBIN based on SLOC config
        if sloc_config['wm_enabled']:
            wm_bins = WmBinService.list_bins(sloc_config['sloc'], '100')
            wm_bin_options = [b['bin'] for b in wm_bins]

            col_wm_input, col_wm_scan = st.columns([4, 1])
            with col_wm_input:
                wm_bin = st.text_input(
                    "WM Bin",
                    value=st.session_state.count_form["wm_bin"],
                    key="wm_bin_input",
                    placeholder="Scan or type WM bin"
                )
                st.session_state.count_form["wm_bin"] = wm_bin.upper() if wm_bin else ""

            with col_wm_scan:
                if st.button("📷", key="scan_wm", help="Scan WM bin"):
                    st.session_state.show_camera = "wm_bin"

        if sloc_config['im_enabled']:
            col_z_input, col_z_scan = st.columns([4, 1])
            with col_z_input:
                zbin = st.text_input(
                    "ZBIN",
                    value=st.session_state.count_form["zbin"],
                    key="zbin_input",
                    placeholder="Scan or type ZBIN"
                )
                st.session_state.count_form["zbin"] = zbin.upper() if zbin else ""

            with col_z_scan:
                if st.button("📷", key="scan_zbin", help="Scan ZBIN"):
                    st.session_state.show_camera = "zbin"

        # Quantity
        quantity = st.number_input(
            "Quantity",
            value=float(st.session_state.count_form["quantity"]) if st.session_state.count_form["quantity"] else 0.0,
            min_value=0.0,
            step=0.1,
            key="quantity_input"
        )
        st.session_state.count_form["quantity"] = str(quantity) if quantity else ""

        # Notes
        notes = st.text_area(
            "Notes",
            value=st.session_state.count_form["notes"],
            height=100,
            placeholder="Add any relevant notes"
        )
        st.session_state.count_form["notes"] = notes

    with col2:
        st.subheader("Photos")

        # Photo upload
        uploaded_files = st.file_uploader(
            "Upload photos",
            type=["jpg", "jpeg", "png"],
            accept_multiple_files=True,
            key="photo_uploader"
        )

        if uploaded_files:
            for file in uploaded_files:
                st.image(file, use_column_width=True)

    # Submit button
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("Submit Count", use_container_width=True, type="primary"):
            if not st.session_state.count_form["material_number"]:
                st.error("Material number is required")
            elif not st.session_state.count_form["quantity"]:
                st.error("Quantity is required")
            else:
                try:
                    # Create count record
                    count_id = CountService.create_count(
                        session_id=session_id,
                        username=username,
                        material_number=st.session_state.count_form["material_number"],
                        quantity=float(st.session_state.count_form["quantity"]),
                        sloc=st.session_state.count_form["sloc"],
                        wm_bin=st.session_state.count_form["wm_bin"] if st.session_state.count_form["wm_bin"] else None,
                        zbin=st.session_state.count_form["zbin"] if st.session_state.count_form["zbin"] else None
                    )

                    # Save uploaded photos
                    if uploaded_files:
                        uploads_dir = Path("uploads")
                        uploads_dir.mkdir(exist_ok=True)

                        for file in uploaded_files:
                            filename = f"{count_id}_{uuid.uuid4()}.{file.name.split('.')[-1]}"
                            filepath = uploads_dir / filename
                            with open(filepath, "wb") as f:
                                f.write(file.getbuffer())
                            PhotoService.add_photo(count_id, filename, file.name)

                    # Reset form
                    st.session_state.count_form = {
                        "material_number": "",
                        "quantity": "",
                        "sloc": None,
                        "wm_bin": "",
                        "zbin": "",
                        "notes": "",
                        "photos": []
                    }
                    st.session_state.show_camera = None

                    st.success(f"✓ Count #{count_id} submitted successfully")

                except Exception as e:
                    st.error(f"Error: {str(e)}")

    st.markdown("---")

    # Recent counts
    st.subheader("Recent Counts (This Session)")
    counts = CountService.list_counts(session_id, {"username": username})

    if counts:
        for count in counts[:10]:
            with st.expander(f"#{count['id']} - {count['material_number']} x {count['quantity']} @ {count['sloc']}"):
                col1, col2 = st.columns(2)
                with col1:
                    st.write(f"**Status:** {count['status']}")
                    st.write(f"**Created:** {count['created_at']}")
                    if count['wm_bin']:
                        st.write(f"**WM Bin:** {count['wm_bin']}")
                    if count['zbin']:
                        st.write(f"**ZBIN:** {count['zbin']}")

                with col2:
                    # Show photos
                    photos = PhotoService.get_photos(count['id'])
                    if photos:
                        for photo in photos[:3]:
                            filepath = Path("uploads") / photo['filename']
                            if filepath.exists():
                                st.image(str(filepath), width=100)

                # Actions
                if count['status'] == 'pending':
                    if st.button("Mark as Verified", key=f"verify_{count['id']}"):
                        CountService.verify_count(count['id'], username)
                        st.rerun()

    else:
        st.info("No counts yet this session")
