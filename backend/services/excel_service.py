"""
Excel Shipment File Generator Service
Processes client data and generates market-specific shipment files
"""

import pandas as pd
import openpyxl
from openpyxl import load_workbook
import io
import re
import unicodedata
from typing import Dict, List, Optional, Tuple
import zipfile
from datetime import datetime
from pathlib import Path

# Absolute path to templates directory (robust regardless of working directory)
_DEFAULT_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

# Column mapping configuration
# Maps template columns → client data columns (with fallback)
# Format: 'TEMPLATE_COL': ['primary_column', 'fallback_column']
COLUMN_MAPPINGS = {
    'IT': {
        'MEMBER_ID': ['user_id'],
        'NOME': ['nombre', 'name'],
        'COGNOME': ['apellido', 'name'],
        'INDIRIZZO': ['direccion'],
        'DETTAGLI': ['complemento_direccion'],
        'CAP': ['codigo_postal', 'postal_code'],
        'CITTÀ ': ['ciudad', 'city'],
        'PROVINCIA': ['provincia'],
        'TELEFONO': ['telefono'],
        'EMAIL': ['email']
    },
    'FR': {
        'MEMBER_ID': ['user_id'],
        'PRENOM': ['nombre', 'name'],
        'NOM': ['apellido', 'name'],
        'ADRESSE': ['direccion'],
        'COMPLEMENT ADRESSE': ['complemento_direccion'],
        'CP': ['codigo_postal', 'postal_code'],
        'VILLE': ['ciudad', 'city'],
        'REGION': ['provincia'],
        'EMAIL ': ['email'],
        'TÉLEFONO': ['telefono']
    },
    'ES': {
        'MEMBER ID ': ['user_id'],
        'NOMBRE': ['nombre', 'name'],
        'APELLIDOS': ['apellido', 'name'],
        'DIRECCIÓN': ['direccion'],
        'DETALLES': ['complemento_direccion'],
        'CODIGO POSTAL': ['codigo_postal', 'postal_code'],
        'CIUDAD': ['ciudad', 'city'],
        'PROVINCIA': ['provincia'],
        'TÉLEFONO': ['telefono'],
        'EMAIL ': ['email']
    }
}

# Template sheet names
TEMPLATE_SHEETS = {
    'IT': 'Template IT',
    'FR': 'Sheet1',
    'ES': 'Sheet1'
}

# Market names for file naming
MARKET_NAMES = {
    'IT': 'Italy',
    'FR': 'France',
    'ES': 'Spain'
}

# --- Cross-market detection (used only in validation to flag suspicious rows) ---

# French department codes (first 2-3 digits of postal code)
FRENCH_DEPTS = set(range(1, 96)) | {971, 972, 973, 974, 976}

# Italian province codes (2-letter, uppercase)
ITALIAN_PROVINCE_CODES = {
    'AG', 'AL', 'AN', 'AO', 'AQ', 'AR', 'AP', 'AT', 'AV',
    'BA', 'BT', 'BL', 'BN', 'BG', 'BI', 'BO', 'BZ', 'BS', 'BR',
    'CA', 'CL', 'CB', 'CE', 'CT', 'CZ', 'CH', 'CO', 'CS', 'CR', 'KR', 'CN',
    'EN', 'FM', 'FE', 'FI', 'FG', 'FC', 'FR',
    'GE', 'GO', 'GR', 'IM', 'IS', 'SP', 'LT', 'LE', 'LC', 'LI', 'LO', 'LU',
    'MC', 'MN', 'MS', 'MT', 'ME', 'MI', 'MO', 'MB',
    'NA', 'NO', 'NU', 'OG', 'OT', 'OR',
    'PD', 'PA', 'PR', 'PV', 'PG', 'PU', 'PE', 'PC', 'PI', 'PT', 'PN', 'PZ', 'PO',
    'RG', 'RA', 'RC', 'RE', 'RI', 'RN', 'RM', 'RO',
    'SA', 'SS', 'SV', 'SI', 'SR', 'SO',
    'TA', 'TE', 'TR', 'TO', 'TP', 'TN', 'TV', 'TS',
    'UD', 'VA', 'VE', 'VB', 'VC', 'VR', 'VV', 'VI', 'VT',
}

# Major Italian cities (lowercase, no accents)
ITALIAN_CITIES = {
    'roma', 'milano', 'napoli', 'torino', 'palermo', 'genova', 'bologna',
    'firenze', 'bari', 'catania', 'venezia', 'verona', 'messina', 'padova',
    'trieste', 'taranto', 'brescia', 'prato', 'reggio calabria', 'modena',
    'parma', 'livorno', 'cagliari', 'reggio emilia', 'perugia', 'ravenna',
    'ancona', 'ferrara', 'salerno', 'bergamo', 'trento', 'novara', 'vicenza',
    'lecce', 'pesaro', 'arezzo', 'pescara', 'udine', 'foggia', 'siracusa',
    'sassari', 'monza', 'rimini', 'cosenza', 'piacenza', 'catanzaro',
    'la spezia', 'bolzano', 'terni', 'forli', 'potenza', 'matera',
    'asti', 'alessandria', 'mantova', 'cremona', 'como', 'varese',
}

# Spanish province names (lowercase, no accents)
SPANISH_PROVINCE_NAMES = {
    'alava', 'araba', 'albacete', 'alicante', 'alacant', 'almeria', 'avila',
    'badajoz', 'baleares', 'balears', 'illes balears', 'barcelona', 'burgos',
    'caceres', 'cadiz', 'castellon', 'ciudad real', 'cordoba',
    'coruña', 'coruna', 'a coruña', 'la coruña', 'cuenca', 'girona', 'gerona',
    'granada', 'guadalajara', 'guipuzcoa', 'gipuzkoa', 'huelva', 'huesca',
    'jaen', 'leon', 'lleida', 'lerida', 'la rioja', 'rioja', 'lugo', 'madrid',
    'malaga', 'murcia', 'navarra', 'navarre', 'ourense', 'orense', 'palencia',
    'las palmas', 'pontevedra', 'salamanca', 'santa cruz de tenerife', 'tenerife',
    'cantabria', 'segovia', 'sevilla', 'seville', 'soria', 'tarragona', 'teruel',
    'toledo', 'valencia', 'valladolid', 'vizcaya', 'bizkaia', 'zamora',
    'zaragoza', 'asturias', 'ceuta', 'melilla',
}


def _normalize(text: str) -> str:
    """Lowercase and strip accents from a string"""
    return ''.join(
        c for c in unicodedata.normalize('NFD', text.lower().strip())
        if unicodedata.category(c) != 'Mn'
    )


def _classify_row_to_market(row) -> Optional[str]:
    """
    Attempt to classify a row to IT, FR, or ES based on available signals.
    Used only for validation (cross-market detection), not for filtering.
    Returns None if classification is ambiguous.
    """
    # 1. Province-based (highest confidence)
    if 'provincia' in row.index and pd.notna(row['provincia']):
        prov_raw = str(row['provincia']).strip()
        if prov_raw and prov_raw not in ('nan', 'None', ''):
            if re.match(r'^[A-Z]{2}$', prov_raw) and prov_raw in ITALIAN_PROVINCE_CODES:
                return 'IT'
            if _normalize(prov_raw) in SPANISH_PROVINCE_NAMES:
                return 'ES'

    # 2. City-based fallback for IT
    for col in ('ciudad', 'city'):
        if col in row.index and pd.notna(row[col]):
            city_norm = _normalize(str(row[col]))
            if city_norm in ITALIAN_CITIES:
                return 'IT'
            break

    # 3. Postal code
    postal_code = None
    for col in ('codigo_postal', 'postal_code'):
        if col in row.index and pd.notna(row[col]):
            val = row[col]
            postal_code = str(int(val)).zfill(5) if isinstance(val, (int, float)) else str(val).strip()
            break

    if not postal_code or not re.match(r'^\d{5}$', postal_code):
        return None

    pc_int = int(postal_code)
    dept = pc_int // 1000

    if dept in FRENCH_DEPTS:
        return 'FR'
    if pc_int >= 60000:
        return 'IT'

    return None  # Too ambiguous to classify confidently


class ShipmentProcessor:
    """Handles shipment file generation"""

    def __init__(self, templates_dir: str = None):
        self.client_data = None
        self.templates = {}
        self.templates_dir = templates_dir or str(_DEFAULT_TEMPLATES_DIR)
        self._load_latest_templates()

    def _load_latest_templates(self):
        """Load the latest template for each market from templates directory"""
        templates_path = Path(self.templates_dir)
        if not templates_path.exists():
            print(f"⚠️  Templates directory not found: {self.templates_dir}")
            templates_path.mkdir(parents=True, exist_ok=True)
            print(f"✅ Created templates directory: {self.templates_dir}")
            return

        pattern = re.compile(r'^Shipment_([A-Z]{2})_(\d{8}_\d{6})\.xlsx$')
        market_templates = {}

        for file_path in templates_path.glob("Shipment_*.xlsx"):
            match = pattern.match(file_path.name)
            if match:
                market = match.group(1)
                timestamp = match.group(2)
                if market not in market_templates:
                    market_templates[market] = []
                market_templates[market].append({'path': file_path, 'timestamp': timestamp})

        for market, templates_list in market_templates.items():
            templates_list.sort(key=lambda x: x['timestamp'], reverse=True)
            latest = templates_list[0]
            try:
                with open(latest['path'], 'rb') as f:
                    self.templates[market] = f.read()
                print(f"✅ Loaded latest template for {market}: {latest['path'].name}")
            except Exception as e:
                print(f"❌ Error loading {market} template: {e}")

    def get_available_markets(self) -> List[str]:
        """Get list of markets with templates loaded"""
        return sorted(list(self.templates.keys()))

    def load_client_data(self, file_bytes: bytes) -> pd.DataFrame:
        """Load client data from Excel bytes"""
        try:
            xl = pd.ExcelFile(io.BytesIO(file_bytes))
            sheet_name = 'Resultado consulta' if 'Resultado consulta' in xl.sheet_names else xl.sheet_names[0]
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=sheet_name)
            print(f"📄 Loaded sheet: '{sheet_name}' ({len(df)} rows, columns: {list(df.columns)})")

            required_columns = ['user_id', 'email']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

            df = df.fillna('')

            # Convert numeric columns to clean strings (removes .0 suffix from floats)
            numeric_columns = ['user_id', 'codigo_postal', 'postal_code', 'telefono']
            for col in numeric_columns:
                if col in df.columns:
                    df[col] = df[col].astype(str).str.replace('.0', '', regex=False)

            self.client_data = df
            return df

        except Exception as e:
            raise ValueError(f"Error loading client data: {str(e)}")

    def load_template(self, file_bytes: bytes, market: str) -> openpyxl.Workbook:
        """Load market template"""
        try:
            workbook = load_workbook(io.BytesIO(file_bytes))
            self.templates[market] = file_bytes
            return workbook
        except Exception as e:
            raise ValueError(f"Error loading {market} template: {str(e)}")

    def generate_shipment_file(self, market: str) -> bytes:
        """Generate shipment file for a market using all client data"""
        if market not in self.templates:
            raise ValueError(f"Template for {market} not loaded")
        if self.client_data is None or self.client_data.empty:
            raise ValueError("No client data loaded")

        data = self.client_data
        workbook = load_workbook(io.BytesIO(self.templates[market]))
        sheet_name = TEMPLATE_SHEETS[market]
        worksheet = workbook[sheet_name]
        mapping = COLUMN_MAPPINGS[market]

        # Build header → column index from row 1, stripping spaces for robust matching
        header_to_col = {
            str(cell.value).strip(): cell.column
            for cell in worksheet[1]
            if cell.value is not None
        }

        # Clear any pre-existing data rows from the template (keep header row 1)
        if worksheet.max_row > 1:
            for row_cells in worksheet.iter_rows(min_row=2, max_row=worksheet.max_row):
                for cell in row_cells:
                    cell.value = None

        print(f"📝 Writing {len(data)} rows to {market} template")

        for seq_idx, (_, row) in enumerate(data.iterrows()):
            excel_row = 2 + seq_idx

            for template_col, source_cols in mapping.items():
                col_idx = header_to_col.get(template_col.strip())
                if col_idx is None:
                    continue

                value = ''
                for source_col in source_cols:
                    if source_col in row:
                        potential_value = row[source_col]
                        if potential_value is None or pd.isna(potential_value):
                            continue
                        str_value = str(potential_value).strip()
                        if str_value in ('', 'None', 'nan', 'NaN'):
                            continue
                        value = str(potential_value).replace('.0', '') if isinstance(potential_value, (int, float)) else str_value
                        break

                worksheet.cell(row=excel_row, column=col_idx, value=value)

        print(f"✅ {market}: Wrote {len(data)} rows successfully")

        output = io.BytesIO()
        workbook.save(output)
        output.seek(0)
        return output.getvalue()


def create_zip_file(files_dict: Dict[str, bytes], timestamp: str = None) -> bytes:
    """Create ZIP file containing all shipment files"""
    if timestamp is None:
        timestamp = datetime.now().strftime('%Y-%m-%d_%Hh%M')

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for market, file_bytes in files_dict.items():
            market_name = MARKET_NAMES.get(market, market)
            filename = f"Shipment_{market_name}_{timestamp}.xlsx"
            zip_file.writestr(filename, file_bytes)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def detect_dominant_market(data: pd.DataFrame) -> Optional[str]:
    """
    Returns the market with the most classified rows, or None if nothing detected.
    Used to auto-suggest the market after file upload.
    """
    counts: Dict[str, int] = {'IT': 0, 'FR': 0, 'ES': 0}
    for _, row in data.iterrows():
        m = _classify_row_to_market(row)
        if m:
            counts[m] += 1
    if not any(counts.values()):
        return None
    return max(counts, key=lambda k: counts[k])


def validate_shipment_data(data: pd.DataFrame, market: str) -> Dict:
    """
    Validate shipment data for the selected market.
    Includes cross-market detection: flags rows that seem to belong to a different country.
    """
    blocking_errors = []
    warnings = []
    validations = []

    postal_patterns = {
        'IT': r'^\d{5}$',
        'FR': r'^\d{5}$',
        'ES': r'^[0-5]\d{4}$'
    }

    market_labels = {'IT': 'Italy', 'FR': 'France', 'ES': 'Spain'}

    for idx, row in data.iterrows():
        row_num = idx + 2
        user_id = row.get('user_id', 'Unknown')

        def get_value(primary_col, fallback_col=None):
            val = row.get(primary_col)
            if pd.notna(val) and str(val).strip() not in ['', 'None', 'nan']:
                return str(val).strip()
            if fallback_col:
                val = row.get(fallback_col)
                if pd.notna(val) and str(val).strip() not in ['', 'None', 'nan']:
                    return str(val).strip()
            return None

        # --- Blocking errors ---
        if not get_value('direccion'):
            blocking_errors.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing address'})
        if not get_value('codigo_postal', 'postal_code'):
            blocking_errors.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing postal code'})
        if not get_value('ciudad', 'city'):
            blocking_errors.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing city'})
        if not get_value('nombre', 'name'):
            blocking_errors.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing name'})
        if not get_value('email'):
            blocking_errors.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing email'})

        # --- Warnings ---
        if not get_value('telefono'):
            warnings.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing phone number'})
        if not get_value('provincia'):
            warnings.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing province/region'})
        if not get_value('apellido') and get_value('nombre', 'name'):
            warnings.append({'row': row_num, 'user_id': user_id, 'issue': 'Missing last name'})

        # --- Suspicious data ---
        postal_code = get_value('codigo_postal', 'postal_code')
        if postal_code:
            pattern = postal_patterns.get(market)
            if pattern and not re.match(pattern, postal_code):
                try:
                    float(postal_code)  # Valid number → will be cleaned, skip
                except ValueError:
                    validations.append({'row': row_num, 'user_id': user_id, 'issue': f'Invalid postal code format: "{postal_code}"'})

        email = get_value('email')
        if email and '@' not in email:
            validations.append({'row': row_num, 'user_id': user_id, 'issue': f'Invalid email format: "{email}"'})

        phone = get_value('telefono')
        if phone and len(re.sub(r'\D', '', phone)) < 7:
            validations.append({'row': row_num, 'user_id': user_id, 'issue': f'Phone number too short: "{phone}"'})

        address = get_value('direccion')
        if address and len(address) < 5:
            validations.append({'row': row_num, 'user_id': user_id, 'issue': f'Address too short: "{address}"'})

        # Cross-market detection: flag rows that seem to belong to a different country
        detected_market = _classify_row_to_market(row)
        if detected_market and detected_market != market:
            validations.append({
                'row': row_num,
                'user_id': user_id,
                'issue': f'Row may belong to {market_labels[detected_market]} (postal code / province signal)'
            })

    total_rows = len(data)
    valid_rows = total_rows - len(set(e['row'] for e in blocking_errors))

    return {
        'total_rows': total_rows,
        'valid_rows': valid_rows,
        'blocking_errors': blocking_errors,
        'warnings': warnings,
        'validations': validations,
        'has_issues': len(blocking_errors) > 0 or len(warnings) > 0 or len(validations) > 0
    }
