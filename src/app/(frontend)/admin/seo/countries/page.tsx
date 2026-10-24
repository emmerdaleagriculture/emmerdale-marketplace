import { redirect } from 'next/navigation';

/**
 * The worldwide page lived here for its first day (#275) and the admin
 * emails sent that day link to it. It is /admin/abroad now, under Network.
 */
export default function CountriesMoved() {
  redirect('/admin/abroad');
}
