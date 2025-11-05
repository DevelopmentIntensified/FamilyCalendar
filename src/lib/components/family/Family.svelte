<script lang="ts">
	import type { Family, User } from '$lib/server/db/schema';

	export let family: Family;
	export let familyMembers: User[];
</script>

<div>
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Actions</th>
			</tr>
		</thead>
        <tbody>
            {#each familyMembers as member}
                <tr>
                    <td>{member.lastName}, {member.firstName}</td>
                    <td>
                        <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            View Details
                        </button>
                    </td>
                </tr>
            {/each}
        </tbody>
	</table>
</div>
