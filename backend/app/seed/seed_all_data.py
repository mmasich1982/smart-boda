"""
Master seed script - runs all seed scripts in order.
"""
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import seed modules
from app.seed import seed_languages
from app.seed import seed_admin_users
from app.seed import seed_trip_master_data
from app.seed import seed_fuel_master_data
from app.seed import seed_financial_master_data
from app.seed import seed_compliance_master_data
from app.seed import seed_value_preview_config
from app.seed import seed_ui_strings

def run_all_seeds():
    """Run all seed scripts in order."""
    
    try:
        logger.info("=" * 60)
        logger.info("Starting database seeding...")
        logger.info("=" * 60)
        
        # Run seeds in order (dependencies first)
        logger.info("\n[1/8] Seeding languages...")
        seed_languages.run()
        logger.info("✓ Languages seeded")
        
        logger.info("\n[2/8] Seeding admin users...")
        seed_admin_users.run()
        logger.info("✓ Admin users seeded")
        
        logger.info("\n[3/8] Seeding trip master data...")
        seed_trip_master_data.run()
        logger.info("✓ Trip master data seeded")
        
        logger.info("\n[4/8] Seeding fuel master data...")
        seed_fuel_master_data.run()
        logger.info("✓ Fuel master data seeded")
        
        logger.info("\n[5/8] Seeding financial master data...")
        seed_financial_master_data.run()
        logger.info("✓ Financial master data seeded")
        
        logger.info("\n[6/8] Seeding compliance master data...")
        seed_compliance_master_data.run()
        logger.info("✓ Compliance master data seeded")
        
        logger.info("\n[7/8] Seeding value preview config...")
        seed_value_preview_config.run()
        logger.info("✓ Value preview config seeded")
        
        logger.info("\n[8/8] Seeding UI strings...")
        seed_ui_strings.run()
        logger.info("✓ UI strings seeded")
        
        logger.info("\n" + "=" * 60)
        logger.info("✓ ALL SEEDS COMPLETED SUCCESSFULLY!")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"\n✗ ERROR during seeding: {str(e)}", exc_info=e)
        sys.exit(1)

if __name__ == "__main__":
    run_all_seeds()