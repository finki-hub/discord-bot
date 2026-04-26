import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

import { type Staff, StaffSchema } from '../schemas/Staff.js';
import { clearTransformedProfessors } from './cache.js';

let staff: Staff[] = [];

export const reloadStaff = async () => {
  await loadJsonResource({
    label: 'staff',
    onLoaded: (data: Staff[]) => {
      staff = data;
      clearTransformedProfessors();
    },
    resource: 'staff.json',
    schema: StaffSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'staff', reload: reloadStaff });
};

export const getStaff = (): Staff[] => staff;
