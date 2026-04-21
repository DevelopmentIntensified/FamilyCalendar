interface WaitlistConfirmationParams {
	name: string;
}

export function getWaitlistConfirmationHtml({ name }: WaitlistConfirmationParams): string {
	const firstName = name.split(' ')[0];

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Welcome to FamilyPlanner</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
					<tr>
						<td style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
							<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
								<tr>
									<td style="background-color: #dd5822; padding: 32px; text-align: center;">
										<h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
											FamilyPlanner
										</h1>
									</td>
								</tr>
								<tr>
									<td style="padding: 40px 32px;">
										<h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; font-weight: 600;">
											You're on the list, ${firstName}!
										</h2>
										<p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
											Thanks for joining the FamilyPlanner waitlist. We're building a better way for families to organize their lives together, and your interest means a lot.
										</p>

										<div style="background-color: #fef7f0; border-left: 4px solid #dd5822; border-radius: 0 8px 8px 0; padding: 20px; margin: 0 0 24px;">
											<h3 style="margin: 0 0 8px; color: #dd5822; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
												Early Access Benefits
											</h3>
											<ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
												<li>Be among the first to access FamilyPlanner</li>
												<li>Priority support during early launch</li>
												<li>Special founding member pricing</li>
											</ul>
										</div>

										<p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
											We're working hard to ship FamilyPlanner as soon as possible. We'll send you an email the moment your early access is ready.
										</p>

										<p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
											Questions or feedback? Just hit reply - we'd love to hear from you.
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 24px 32px; background-color: #f1f5f9; text-align: center;">
										<p style="margin: 0; color: #64748b; font-size: 12px;">
											FamilyPlanner
										</p>
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`;
}